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
import random
import time

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from agent import run_pipeline
from manager import analyze_and_delegate, run_conversation, extract_new_skills, review_skill
import knowledge

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
        batch_id = f"batch-{int(time.time())}"
        # Load persisted skills from previous batches
        skills: list[dict] = list(knowledge.knowledge_base)

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

            # Emit tool call events — these are the verifiable skill usage evidence
            for tc in result.get("tool_calls", []):
                await event_queue.put(_sse_event("tool_call", {
                    "employeeId": emp_id,
                    "leadIdx": lead_idx,
                    "tool": tc["tool"],
                    "input": tc["input"],
                    "result": tc["result"],
                }))
                # Timeline events for tool calls
                if tc["tool"] == "use_skill":
                    evt = knowledge.add_timeline_event(
                        event_type="skill_applied",
                        agent_name=emp.get("name", emp_id),
                        lead_name=lead.get("name", ""),
                        detail=f"use_skill({tc['input'].get('skill_name', '')}) — {tc['input'].get('reasoning', '')}",
                    )
                    await event_queue.put(_sse_event("timeline_event", {"event": evt}))
                elif tc["tool"] == "report_new_skill":
                    evt = knowledge.add_timeline_event(
                        event_type="skill_extracted",
                        agent_name=emp.get("name", emp_id),
                        lead_name=lead.get("name", ""),
                        detail=f"report_new_skill({tc['input'].get('skill_name', '')}) — {tc['input'].get('strategy', '')}",
                    )
                    await event_queue.put(_sse_event("timeline_event", {"event": evt}))

            # Check for new skills
            new_skills = extract_new_skills(
                result.get("objections_handled", []), skills
            )
            # Collect other employee names for teaching event
            other_employees = [e for e in employees if e["id"] != emp_id]

            for skill in new_skills:
                skill_name = skill.get("skill_name", "")
                emp_name = emp.get("name", emp_id)

                # Employee discovered the skill
                await event_queue.put(_sse_event("skill_learned", {
                    "employeeId": emp_id,
                    "skill": skill,
                }))

                # Johnny reviews the skill (real Claude-based review)
                await event_queue.put(_sse_event("manager_reviewing_skill", {
                    "employeeId": emp_id,
                    "employeeName": emp_name,
                    "skill": skill,
                }))

                review_result = await asyncio.to_thread(
                    review_skill,
                    skill,
                    result.get("conversation", []),
                    result.get("outcome", "follow_up"),
                    list(skills),
                )
                rejected = not review_result.get("approved", True)
                johnny_message = review_result.get("reason", "Reviewed.")

                if rejected:
                    # Still track so it doesn't get re-discovered
                    skill["rejected"] = True
                    skills.append(skill)

                    await event_queue.put(_sse_event("manager_rejected_skill", {
                        "employeeId": emp_id,
                        "employeeName": emp_name,
                        "skill": skill,
                        "reason": johnny_message,
                    }))

                    evt_reject = knowledge.add_timeline_event(
                        event_type="skill_rejected",
                        agent_name="Johnny",
                        lead_name=lead.get("name", ""),
                        detail=f"Rejected '{skill_name}' from {emp_name} — {johnny_message}",
                    )
                    await event_queue.put(_sse_event("timeline_event", {"event": evt_reject}))

                    await event_queue.put(_sse_event("manager_broadcast", {
                        "message": f"Johnny reviewed '{skill_name}' from {emp_name} but decided to pass — {johnny_message}",
                        "skill": skill,
                    }))
                else:
                    skills.append(skill)
                    # Persist to cross-batch knowledge base
                    kb_entry = knowledge.add_skill(
                        skill_name=skill_name,
                        strategy=skill.get("strategy", ""),
                        source_agent=emp_name,
                        source_lead=lead.get("name", ""),
                        batch_id=batch_id,
                    )

                    await event_queue.put(_sse_event("manager_approved_skill", {
                        "employeeId": emp_id,
                        "employeeName": emp_name,
                        "skill": skill,
                        "approvalMessage": johnny_message,
                    }))

                    # Timeline: skill extracted & approved
                    evt_skill = knowledge.add_timeline_event(
                        event_type="skill_extracted",
                        agent_name="Johnny",
                        lead_name=lead.get("name", ""),
                        detail=f"Approved '{skill_name}' from {emp_name} — {johnny_message}",
                        related_skill_id=kb_entry["id"],
                    )
                    await event_queue.put(_sse_event("timeline_event", {"event": evt_skill}))

                    # Teaching moment: Johnny teaches the team
                    recipients = [{"id": e["id"], "name": e.get("name", e["id"])} for e in other_employees]
                    evt_teach = knowledge.add_timeline_event(
                        event_type="skill_shared",
                        agent_name="Johnny",
                        lead_name=lead.get("name", ""),
                        detail=f"Johnny is teaching '{skill_name}' to the team",
                        related_skill_id=kb_entry["id"],
                        shared_with=[r["name"] for r in recipients],
                    )
                    await event_queue.put(_sse_event("teaching_moment", {
                        "teacherName": "Johnny",
                        "teacherId": "manager",
                        "skill": skill,
                        "recipients": recipients,
                        "timestamp": evt_teach["timestamp"],
                    }))
                    await event_queue.put(_sse_event("timeline_event", {"event": evt_teach}))

                    await event_queue.put(_sse_event("manager_broadcast", {
                        "message": f"Johnny approved '{skill_name}' from {emp_name} and is teaching it to the team.",
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


# ── Knowledge Base Endpoints ──
@app.get("/knowledge-base")
async def get_knowledge_base():
    return {"skills": knowledge.knowledge_base, "count": len(knowledge.knowledge_base)}


@app.get("/learning-timeline")
async def get_learning_timeline():
    return {"events": knowledge.learning_timeline, "count": len(knowledge.learning_timeline)}


@app.delete("/knowledge-base")
async def clear_knowledge_base():
    knowledge.clear()
    return {"status": "cleared"}
