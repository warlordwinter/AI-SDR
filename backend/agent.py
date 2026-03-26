import json
import logging
import os

import anthropic
from tavily import TavilyClient

from prompts import RESEARCH_SYSTEM_PROMPT, FIT_SCORE_SYSTEM_PROMPT

logger = logging.getLogger("sdr-agent")

MODEL = "claude-haiku-4-5-20251001"


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
        client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
        query = f"{company} company news funding growth 2025 2026"
        logger.info("🔍 Tavily search: %s", query)
        results = client.search(query, max_results=5)
        return json.dumps(results.get("results", []), indent=2)
    except Exception as e:
        logger.warning("⚠️  Tavily search failed: %s — continuing without search results", e)
        return f"[No search results available. Company name: {company}]"


def _call_claude(system_prompt: str, user_content: str, max_tokens: int = 1024) -> dict:
    """Make a Claude API call and parse the JSON response."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
        timeout=30.0,
    )
    raw = message.content[0].text
    return _parse_json(raw)


def _call_claude_with_tools(
    system_prompt: str,
    user_content: str,
    tools: list[dict],
    tool_handler: callable,
    max_tokens: int = 2048,
    max_rounds: int = 10,
) -> tuple[str, list[dict]]:
    """Claude API call with tool use loop.

    Returns (final_text, tool_calls) where tool_calls is a list of
    {"tool": name, "input": {...}, "result": str} dicts.
    """
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    messages = [{"role": "user", "content": user_content}]
    all_tool_calls: list[dict] = []

    for _ in range(max_rounds):
        response = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
            tools=tools,
            timeout=60.0,
        )

        # Collect text and tool_use blocks from the response
        assistant_content = response.content
        text_parts = []
        tool_uses = []
        for block in assistant_content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(block)

        # Add assistant message to conversation
        messages.append({"role": "assistant", "content": assistant_content})

        # If no tool calls, we're done
        if response.stop_reason != "tool_use" or not tool_uses:
            return "\n".join(text_parts), all_tool_calls

        # Process each tool call
        tool_results = []
        for tu in tool_uses:
            result_str = tool_handler(tu.name, tu.input)
            all_tool_calls.append({
                "tool": tu.name,
                "input": tu.input,
                "result": result_str,
            })
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": result_str,
            })

        # Feed tool results back
        messages.append({"role": "user", "content": tool_results})

    # Exhausted rounds — return what we have
    return "\n".join(text_parts), all_tool_calls


def run_pipeline(lead: dict, rep_name: str, company: str, product_desc: str) -> dict:
    """Run the full SDR pipeline: research → fit score."""

    lead_name = lead["name"]
    lead_title = lead["title"]
    lead_company = lead["company"]

    # ── Step 1: Research ──
    logger.info("📋 Step 1/2 — Researching %s", lead_company)
    search_results = _search_company(lead_company)

    research_prompt = RESEARCH_SYSTEM_PROMPT.format(product_desc=product_desc)
    research = _call_claude(
        system_prompt=research_prompt,
        user_content=f"Web search results for {lead_company}:\n\n{search_results}",
    )
    logger.info("✅ Research complete: %s", json.dumps(research, indent=2))

    # ── Step 2: Fit scoring ──
    logger.info("📊 Step 2/2 — Scoring lead fit for %s", lead_name)
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
    }
