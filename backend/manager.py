import json
import logging

from agent import _call_claude, _search_company
from prompts import (
    MANAGER_SYSTEM_PROMPT,
    CONVERSATION_SYSTEM_PROMPT,
    RESEARCH_SYSTEM_PROMPT,
    SKILLS_INJECTION,
)

logger = logging.getLogger("sdr-manager")


def analyze_and_delegate(leads: list[dict], product_desc: str) -> dict:
    """Manager analyzes all leads and returns a delegation plan."""
    leads_summary = "\n".join(
        f"[{i}] {l.get('name','?')} — {l.get('title','?')} at {l.get('company','?')}"
        for i, l in enumerate(leads)
    )
    prompt = MANAGER_SYSTEM_PROMPT.format(product_desc=product_desc)
    result = _call_claude(
        system_prompt=prompt,
        user_content=f"Here are the leads to analyze:\n\n{leads_summary}",
    )
    logger.info("Manager plan: %s employees created", len(result.get("employees", [])))
    return result


def run_conversation(
    lead: dict,
    rep_name: str,
    company: str,
    product_desc: str,
    persona: str,
    skills: list[dict],
) -> dict:
    """Run research + simulated conversation for a single lead."""
    lead_name = lead["name"]
    lead_title = lead["title"]
    lead_company = lead["company"]

    # Step 1: Research (reuse existing)
    logger.info("Researching %s", lead_company)
    search_results = _search_company(lead_company)
    research_prompt = RESEARCH_SYSTEM_PROMPT.format(product_desc=product_desc)
    research = _call_claude(
        system_prompt=research_prompt,
        user_content=f"Web search results for {lead_company}:\n\n{search_results}",
    )

    # Step 2: Build skills section
    skills_section = ""
    if skills:
        skills_list = "\n".join(
            f"- {s['skill_name']}: {s['strategy']}" for s in skills
        )
        skills_section = SKILLS_INJECTION.format(skills_list=skills_list)

    # Step 3: Simulated conversation
    logger.info("Running conversation with %s", lead_name)
    conv_prompt = CONVERSATION_SYSTEM_PROMPT.format(
        rep_name=rep_name,
        company=company,
        lead_name=lead_name,
        lead_title=lead_title,
        lead_company=lead_company,
        product_desc=product_desc,
        signal=research.get("signal", ""),
        persona=persona,
        skills_section=skills_section,
    )
    conversation = _call_claude(
        system_prompt=conv_prompt,
        user_content=f"Research context:\n{json.dumps(research, indent=2)}\n\nBegin the simulated conversation.",
    )

    return {
        "research": research,
        "conversation": conversation.get("messages", []),
        "outcome": conversation.get("outcome", "follow_up"),
        "objections_handled": conversation.get("objections_handled", []),
        "email": conversation.get("email", {}),
        "fitScore": 7,  # Default, can enhance later
        "fitReason": persona,
    }


def extract_new_skills(
    objections_handled: list[dict], existing_skills: list[dict]
) -> list[dict]:
    """Return objection strategies that are new (not already in existing_skills)."""
    existing_names = {s["skill_name"].lower() for s in existing_skills}
    return [
        o for o in objections_handled
        if o.get("skill_name", "").lower() not in existing_names
    ]
