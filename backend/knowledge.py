"""
In-memory knowledge base and learning timeline.
Persists across batch runs for the lifetime of the server process.
"""

import time

# ── Global state ──────────────────────────────────────────────
knowledge_base: list[dict] = []   # accumulated skills across batches
learning_timeline: list[dict] = []  # chronological learning events

_counter = 0


def next_id(prefix: str) -> str:
    global _counter
    _counter += 1
    return f"{prefix}-{_counter}"


def add_skill(
    skill_name: str,
    strategy: str,
    source_agent: str,
    source_lead: str,
    batch_id: str,
) -> dict:
    """Add a skill to the persistent knowledge base. Returns the new entry."""
    entry = {
        "id": next_id("kb"),
        "skill_name": skill_name,
        "strategy": strategy,
        "source_agent": source_agent,
        "source_lead": source_lead,
        "batch_id": batch_id,
        "learned_at": time.time(),
        "times_used": 0,
    }
    knowledge_base.append(entry)
    return entry


def add_timeline_event(
    event_type: str,
    agent_name: str,
    lead_name: str,
    detail: str,
    conflict_type: str = "",
    resolution_strategy: str = "",
    related_skill_id: str = "",
    shared_with: list[str] | None = None,
) -> dict:
    """Append a learning event to the timeline. Returns the new entry."""
    entry = {
        "id": next_id("evt"),
        "timestamp": time.time(),
        "event_type": event_type,  # conflict_detected | reasoning | resolution | skill_extracted | skill_shared
        "agent_name": agent_name,
        "lead_name": lead_name,
        "detail": detail,
        "conflict_type": conflict_type,
        "resolution_strategy": resolution_strategy,
        "related_skill_id": related_skill_id,
        "shared_with": shared_with or [],
    }
    learning_timeline.append(entry)
    return entry


def clear():
    """Reset all knowledge (for demo resets)."""
    knowledge_base.clear()
    learning_timeline.clear()
