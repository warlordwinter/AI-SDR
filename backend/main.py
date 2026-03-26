# ── How to run ──
# cd backend && pip install -r requirements.txt
# Copy .env.example to .env and fill in your ANTHROPIC_API_KEY and TAVILY_API_KEY.
# Then start: uvicorn main:app --reload
# The server runs on http://localhost:8000. The frontend (index.html) already
# points to this address. Open index.html in your browser to use the full UI.

import asyncio
import json
import logging
import os
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from agent import run_pipeline
from manager import analyze_and_delegate, run_conversation, extract_new_skills

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")

# ── App ──
app = FastAPI(title="AI SDR Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ──
class Lead(BaseModel):
    name: str
    title: str
    company: str
    email: str


class RunLeadRequest(BaseModel):
    lead: Lead
    repName: str
    company: str
    productDesc: str


class RunBatchRequest(BaseModel):
    leads: list[Lead]
    repName: str
    company: str
    productDesc: str


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    repName: str


# ── Helpers ──
def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── Endpoints ──
@app.post("/run-lead")
async def run_lead(req: RunLeadRequest):
    try:
        result = run_pipeline(
            lead=req.lead.model_dump(),
            rep_name=req.repName,
            company=req.company,
            product_desc=req.productDesc,
        )
        return result
    except Exception as e:
        logging.getLogger("sdr-agent").error("Pipeline failed: %s", e, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "pipeline failed", "detail": str(e)},
        )


@app.post("/run-batch")
async def run_batch(req: RunBatchRequest):
    leads_raw = [l.model_dump() for l in req.leads]

    async def event_stream():
        logger = logging.getLogger("sdr-manager")
        skills: list[dict] = []

        # Step 1: Manager thinking
        yield _sse_event("manager_thinking", {"message": f"Analyzing {len(leads_raw)} leads..."})
        await asyncio.sleep(0.1)

        # Step 2: Manager creates plan
        try:
            plan = await asyncio.to_thread(
                analyze_and_delegate, leads_raw, req.productDesc
            )
        except Exception as e:
            logger.error("Manager failed: %s", e, exc_info=True)
            yield _sse_event("error", {"message": str(e)})
            return

        yield _sse_event("manager_plan", plan)
        await asyncio.sleep(0.3)

        # Step 3: Create employees one by one
        employees = plan.get("employees", [])
        for emp in employees:
            yield _sse_event("employee_created", {"employee": emp})
            await asyncio.sleep(0.4)

        # Step 4: Process leads in parallel across employees
        # Use an asyncio.Queue so concurrent workers can push SSE events
        event_queue: asyncio.Queue = asyncio.Queue()
        results_map: dict[int, dict] = {}

        async def process_lead(emp, lead_idx):
            emp_id = emp["id"]
            persona = emp.get("persona", "")
            if lead_idx >= len(leads_raw):
                return
            lead = leads_raw[lead_idx]

            await event_queue.put(_sse_event("employee_status", {
                "employeeId": emp_id,
                "leadIdx": lead_idx,
                "stage": "researching company",
            }))

            try:
                result = await asyncio.to_thread(
                    run_conversation,
                    lead, req.repName, req.company, req.productDesc,
                    persona, list(skills),  # snapshot of skills at call time
                )
            except Exception as e:
                logger.error("Conversation failed for lead %d: %s", lead_idx, e, exc_info=True)
                await event_queue.put(_sse_event("employee_status", {
                    "employeeId": emp_id,
                    "leadIdx": lead_idx,
                    "stage": "error",
                }))
                return

            # Queue conversation messages
            for msg in result.get("conversation", []):
                await event_queue.put(_sse_event("conversation_message", {
                    "employeeId": emp_id,
                    "leadIdx": lead_idx,
                    "message": msg,
                }))

            # Check for new skills
            new_skills = extract_new_skills(
                result.get("objections_handled", []), skills
            )
            for skill in new_skills:
                skills.append(skill)
                await event_queue.put(_sse_event("skill_learned", {
                    "employeeId": emp_id,
                    "skill": skill,
                }))
                await event_queue.put(_sse_event("manager_broadcast", {
                    "message": f"{emp.get('name', emp_id)} discovered a new technique: {skill.get('skill_name', '')}",
                    "skill": skill,
                }))

            results_map[lead_idx] = result
            await event_queue.put(_sse_event("lead_complete", {
                "employeeId": emp_id,
                "leadIdx": lead_idx,
                "result": result,
            }))

        # Build all tasks — each employee's leads run concurrently
        all_tasks = []
        for emp in employees:
            for lead_idx in emp.get("assigned_leads", []):
                all_tasks.append(process_lead(emp, lead_idx))

        # Run workers and drain queue concurrently
        async def run_workers():
            await asyncio.gather(*all_tasks)
            await event_queue.put(None)  # sentinel

        worker_task = asyncio.create_task(run_workers())

        while True:
            event = await event_queue.get()
            if event is None:
                break
            yield event

        await worker_task

        # Done
        yield _sse_event("batch_complete", {
            "message": f"All {len(leads_raw)} leads processed. {len(skills)} skills learned.",
            "totalSkills": len(skills),
            "skills": skills,
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/email-config")
async def email_config():
    """Check whether SMTP is configured so the frontend can adapt."""
    configured = bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))
    return {"configured": configured, "from_email": os.getenv("SMTP_USER", "")}


@app.post("/send-email")
async def send_email(req: SendEmailRequest):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    if not smtp_user or not smtp_pass:
        return JSONResponse(
            status_code=400,
            content={"error": "SMTP not configured. Set SMTP_USER and SMTP_PASS in .env"},
        )

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{req.repName} <{smtp_user}>"
    msg["To"] = req.to
    msg["Subject"] = req.subject

    # Plain text version
    msg.attach(MIMEText(req.body, "plain"))

    # Simple HTML version (preserves line breaks)
    html_body = req.body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
    html = f"<html><body><p style='font-family:sans-serif;font-size:14px;color:#222'>{html_body}</p></body></html>"
    msg.attach(MIMEText(html, "html"))

    try:
        await asyncio.to_thread(_smtp_send, smtp_host, smtp_port, smtp_user, smtp_pass, msg)
        logging.getLogger("sdr-email").info("Email sent to %s — %s", req.to, req.subject)
        return {"status": "sent", "to": req.to}
    except Exception as e:
        logging.getLogger("sdr-email").error("Send failed: %s", e, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to send email", "detail": str(e)},
        )


def _smtp_send(host, port, user, password, msg):
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
