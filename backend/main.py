# ── How to run ──
# cd backend && pip install -r requirements.txt
# Copy .env.example to .env and fill in your ANTHROPIC_API_KEY and TAVILY_API_KEY.
# Then start: uvicorn main:app --reload
# The server runs on http://localhost:8000. The frontend (index.html) already
# points to this address. Open index.html in your browser to use the full UI.

import asyncio
import json
import logging
import time

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
