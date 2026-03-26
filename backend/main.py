# ── How to run ──
# cd backend && pip install -r requirements.txt
# Copy .env.example to .env and fill in your ANTHROPIC_API_KEY and TAVILY_API_KEY.
# Then start: uvicorn main:app --reload
# The server runs on http://localhost:8000. The frontend (index.html) already
# points to this address. Open index.html in your browser to use the full UI.

import logging

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agent import run_pipeline

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")

# ── App ──
app = FastAPI(title="AI SDR Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:5500"],
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


# ── Endpoint ──
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
