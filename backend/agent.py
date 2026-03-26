import json
import logging

import anthropic
from tavily import TavilyClient

from prompts import RESEARCH_SYSTEM_PROMPT, EMAIL_SYSTEM_PROMPT, FIT_SCORE_SYSTEM_PROMPT

logger = logging.getLogger("sdr-agent")

MODEL = "claude-sonnet-4-20250514"


def _parse_json(text: str) -> dict:
    """Extract JSON from a Claude response, handling markdown code fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]  # drop opening fence line
        text = text.rsplit("```", 1)[0]  # drop closing fence
    return json.loads(text.strip())


def _search_company(company: str) -> str:
    """Search for company info via Tavily. Returns raw results as string."""
    try:
        client = TavilyClient()
        query = f"{company} company news funding growth 2025 2026"
        logger.info("🔍 Tavily search: %s", query)
        results = client.search(query, max_results=5)
        return json.dumps(results.get("results", []), indent=2)
    except Exception as e:
        logger.warning("⚠️  Tavily search failed: %s — continuing without search results", e)
        return f"[No search results available. Company name: {company}]"


def _call_claude(system_prompt: str, user_content: str) -> dict:
    """Make a Claude API call and parse the JSON response."""
    client = anthropic.Anthropic()
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = message.content[0].text
    return _parse_json(raw)


def run_pipeline(lead: dict, rep_name: str, company: str, product_desc: str) -> dict:
    """Run the full SDR pipeline: research → email → fit score."""

    lead_name = lead["name"]
    lead_title = lead["title"]
    lead_company = lead["company"]

    # ── Step 1: Research ──
    logger.info("📋 Step 1/3 — Researching %s", lead_company)
    search_results = _search_company(lead_company)

    research_prompt = RESEARCH_SYSTEM_PROMPT.format(product_desc=product_desc)
    research = _call_claude(
        system_prompt=research_prompt,
        user_content=f"Web search results for {lead_company}:\n\n{search_results}",
    )
    logger.info("✅ Research complete: %s", json.dumps(research, indent=2))

    # ── Step 2: Email generation ──
    logger.info("✉️  Step 2/3 — Generating email for %s", lead_name)
    email_prompt = EMAIL_SYSTEM_PROMPT.format(
        rep_name=rep_name,
        company=company,
        lead_name=lead_name,
        lead_title=lead_title,
        lead_company=lead_company,
        signal=research.get("signal", ""),
    )
    email = _call_claude(
        system_prompt=email_prompt,
        user_content=f"Research context:\n{json.dumps(research, indent=2)}",
    )
    logger.info("✅ Email generated: %s", email.get("subject"))

    # ── Step 3: Fit scoring ──
    logger.info("📊 Step 3/3 — Scoring lead fit for %s", lead_name)
    fit_prompt = FIT_SCORE_SYSTEM_PROMPT.format(
        product_desc=product_desc,
        lead_name=lead_name,
        lead_title=lead_title,
        lead_company=lead_company,
        research_summary=json.dumps(research),
    )
    fit = _call_claude(
        system_prompt=fit_prompt,
        user_content="Score this lead based on the information provided.",
    )
    logger.info("✅ Fit score: %s — %s", fit.get("fitScore"), fit.get("fitReason"))

    # ── Assemble final response ──
    return {
        "fitScore": fit["fitScore"],
        "fitReason": fit["fitReason"],
        "research": research,
        "email": email,
    }
