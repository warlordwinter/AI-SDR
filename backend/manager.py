import json
import logging

from agent import _call_claude, _call_claude_with_tools, _search_company, _parse_json
from prompts import (
    MANAGER_SYSTEM_PROMPT,
    CONVERSATION_SYSTEM_PROMPT,
    RESEARCH_SYSTEM_PROMPT,
    SKILL_REVIEW_SYSTEM_PROMPT,
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


def _build_skill_tools(skills: list[dict]) -> list[dict]:
    """Build Anthropic tool definitions based on available skills."""
    if skills:
        skills_list = "\n".join(
            f"- {s['skill_name']}: {s['strategy']}" for s in skills
        )
        use_skill_desc = (
            "Call this tool when the prospect raises an objection and you want to "
            "apply a previously learned objection-handling technique. "
            "You MUST call this tool before writing the SDR's response to the objection.\n\n"
            f"Available skills:\n{skills_list}"
        )
    else:
        use_skill_desc = (
            "Call this tool when the prospect raises an objection and you want to "
            "apply a previously learned technique. "
            "No skills have been learned yet — use report_new_skill instead."
        )

    return [
        {
            "name": "use_skill",
            "description": use_skill_desc,
            "input_schema": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "Exact name of the skill to apply",
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "Why this skill fits this specific objection and how you'll adapt it",
                    },
                },
                "required": ["skill_name", "reasoning"],
            },
        },
        {
            "name": "report_new_skill",
            "description": (
                "Call this tool after you handle an objection using a NEW technique "
                "that is NOT in the available skills list above. This teaches the new "
                "technique to the rest of the team so they can use it in future conversations."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "Short, memorable name for this technique (2-4 words)",
                    },
                    "strategy": {
                        "type": "string",
                        "description": "How to apply this technique (1-2 sentences)",
                    },
                    "objection_type": {
                        "type": "string",
                        "enum": ["budget", "timing", "existing_solution", "authority", "skepticism", "other"],
                        "description": "Category of objection this handles",
                    },
                },
                "required": ["skill_name", "strategy", "objection_type"],
            },
        },
    ]


def run_conversation(
    lead: dict,
    rep_name: str,
    company: str,
    product_desc: str,
    persona: str,
    skills: list[dict],
) -> dict:
    """Run research + simulated conversation with tool-based skill usage."""
    lead_name = lead["name"]
    lead_title = lead["title"]
    lead_company = lead["company"]

    # Step 1: Research
    logger.info("Researching %s", lead_company)
    search_results = _search_company(lead_company)
    research_prompt = RESEARCH_SYSTEM_PROMPT.format(product_desc=product_desc)
    research = _call_claude(
        system_prompt=research_prompt,
        user_content=f"Web search results for {lead_company}:\n\n{search_results}",
    )

    # Step 2: Build tools from available skills
    tools = _build_skill_tools(skills)
    skills_by_name = {s["skill_name"].lower(): s for s in skills}

    # Track tool calls for reporting
    tool_call_log: list[dict] = []
    new_skills: list[dict] = []
    used_skills: list[dict] = []

    def tool_handler(tool_name: str, tool_input: dict) -> str:
        if tool_name == "use_skill":
            skill_name = tool_input.get("skill_name", "")
            reasoning = tool_input.get("reasoning", "")
            skill = skills_by_name.get(skill_name.lower())
            if skill:
                logger.info("Skill applied: %s — %s", skill_name, reasoning)
                used_skills.append({
                    "skill_name": skill_name,
                    "reasoning": reasoning,
                    "strategy": skill.get("strategy", ""),
                })
                return (
                    f"Skill activated: {skill_name}\n"
                    f"Strategy: {skill.get('strategy', '')}\n"
                    f"Apply this strategy in your next SDR response."
                )
            else:
                return f"Skill '{skill_name}' not found. Use report_new_skill to create a new technique."

        elif tool_name == "report_new_skill":
            skill_name = tool_input.get("skill_name", "")
            strategy = tool_input.get("strategy", "")
            objection_type = tool_input.get("objection_type", "other")
            logger.info("New skill reported: %s — %s", skill_name, strategy)
            new_skills.append({
                "skill_name": skill_name,
                "strategy": strategy,
                "objection": objection_type,
            })
            return (
                f"New skill registered: {skill_name}\n"
                f"Your team will now learn this technique and can use it in future conversations.\n"
                f"Continue the conversation using this approach."
            )

        return "Unknown tool."

    # Step 3: Run conversation with tools
    logger.info("Running conversation with %s (tools enabled)", lead_name)
    conv_prompt = CONVERSATION_SYSTEM_PROMPT.format(
        rep_name=rep_name,
        company=company,
        lead_name=lead_name,
        lead_title=lead_title,
        lead_company=lead_company,
        product_desc=product_desc,
        signal=research.get("signal", ""),
        persona=persona,
    )

    raw_text, tool_calls = _call_claude_with_tools(
        system_prompt=conv_prompt,
        user_content=f"Research context:\n{json.dumps(research, indent=2)}\n\nBegin the simulated conversation.",
        tools=tools,
        tool_handler=tool_handler,
        max_tokens=2048,
    )

    # Parse the final JSON from the text
    try:
        conversation = _parse_json(raw_text)
    except Exception:
        logger.warning("Failed to parse conversation JSON, using raw text")
        conversation = {"messages": [], "outcome": "follow_up"}

    messages = conversation.get("messages", [])

    # Enrich messages with tool call metadata
    # Map tool calls to messages: use_skill calls mark the next SDR message
    for tc in tool_calls:
        if tc["tool"] == "use_skill":
            skill_name = tc["input"].get("skill_name", "")
            reasoning = tc["input"].get("reasoning", "")
            # Find the next SDR message that doesn't already have skill_applied
            for msg in messages:
                if msg.get("role") == "sdr" and not msg.get("skill_applied"):
                    # Check if the preceding client message could be the objection
                    msg_idx = messages.index(msg)
                    if msg_idx > 0:
                        messages[msg_idx - 1]["is_conflict"] = True
                        messages[msg_idx - 1]["conflict_id"] = skill_name
                    msg["is_conflict"] = True
                    msg["conflict_id"] = skill_name
                    msg["skill_applied"] = skill_name
                    msg["sdr_reasoning"] = reasoning
                    break

        elif tc["tool"] == "report_new_skill":
            skill_name = tc["input"].get("skill_name", "")
            reasoning = tc["input"].get("strategy", "")
            # Find the next SDR message that doesn't already have conflict metadata
            for msg in messages:
                if msg.get("role") == "sdr" and not msg.get("is_conflict"):
                    msg_idx = messages.index(msg)
                    if msg_idx > 0:
                        messages[msg_idx - 1]["is_conflict"] = True
                        messages[msg_idx - 1]["conflict_id"] = skill_name
                    msg["is_conflict"] = True
                    msg["conflict_id"] = skill_name
                    msg["sdr_reasoning"] = f"New technique: {reasoning}"
                    break

    return {
        "research": research,
        "conversation": messages,
        "outcome": conversation.get("outcome", "follow_up"),
        "objections_handled": [
            {"skill_name": s["skill_name"], "strategy": s["strategy"], "objection": s.get("objection", "")}
            for s in new_skills
        ],
        "tool_calls": tool_calls,
        "used_skills": used_skills,
        "new_skills": new_skills,
        "fitScore": 7,
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


def review_skill(
    skill: dict,
    conversation_messages: list[dict],
    outcome: str,
    existing_skills: list[dict],
) -> dict:
    """Johnny reviews a discovered skill using Claude to evaluate its quality."""
    try:
        # Format existing skills as compact list
        if existing_skills:
            skills_text = "\n".join(
                f"- {s.get('skill_name', '?')}: {s.get('strategy', '?')}"
                for s in existing_skills if not s.get("rejected")
            )
        else:
            skills_text = "(none yet)"

        # Format conversation as compact transcript
        transcript = "\n".join(
            f"{m.get('role', '?').upper()}: \"{m.get('text', '')}\""
            for m in conversation_messages
        )

        prompt = SKILL_REVIEW_SYSTEM_PROMPT.format(existing_skills=skills_text)
        user_content = (
            f"SKILL DISCOVERED:\n"
            f"Name: {skill.get('skill_name', '?')}\n"
            f"Strategy: {skill.get('strategy', '?')}\n"
            f"Objection type: {skill.get('objection_type', 'unknown')}\n\n"
            f"CONVERSATION WHERE IT WAS USED:\n{transcript}\n\n"
            f"Outcome: {outcome}"
        )

        result = _call_claude(
            system_prompt=prompt,
            user_content=user_content,
            max_tokens=256,
        )
        return {
            "approved": result.get("approved", True),
            "reason": result.get("reason", "Reviewed."),
        }
    except Exception as e:
        logger.warning("Skill review failed: %s — auto-approving", e)
        return {"approved": True, "reason": "Approved (review unavailable)."}
