# AI Sales Team

An autonomous AI sales development platform that researches leads, simulates personalized outreach conversations, and continuously learns which objection-handling techniques actually work — managed by an AI overseer named Johnny.

## Use Cases

### Outbound Sales
Upload a CSV of target leads and let the AI team work them in parallel. Each AI SDR agent researches the prospect's company (recent funding, product launches, hiring signals), crafts a personalized opening, and navigates realistic objections. Johnny reviews every new technique the team discovers and promotes the best ones across all agents — so the team gets sharper with every batch.

**Example workflow:** You export 50 VP-of-Sales leads from your CRM, upload the CSV, and set your product description. The system spins up specialized agents (e.g., "Enterprise SaaS Specialist", "Startup Growth Hacker"), assigns leads by fit, and produces tailored conversation drafts and follow-up emails for each.

### Inside Sales
Use the platform to train and pressure-test your human sales team. Run batches against your real lead list to see which objections come up most often, which handling strategies succeed, and where conversations stall. The knowledge base Johnny curates becomes a living playbook your reps can reference — grounded in simulated but realistic prospect interactions rather than generic sales theory.

**Example workflow:** Before a team standup, run the latest pipeline leads through the system. Review the skill tree to see which objection patterns are trending (budget, timing, authority) and share Johnny's approved techniques with your reps as coaching material.

## How It Works

1. **Upload leads** — drag a CSV with `name, title, company, email` columns onto the UI
2. **Johnny delegates** — the AI manager analyzes lead diversity and creates 2-4 specialized SDR agents
3. **Agents research & converse** — each agent searches the web for company signals, then runs a multi-turn sales conversation where the prospect raises realistic objections
4. **Skills are discovered** — when an agent handles an objection, it either applies an existing technique or invents a new one
5. **Johnny reviews** — the overseer agent reads the full conversation and evaluates each new skill on effectiveness, generalizability, professionalism, and novelty using Claude
6. **Team learns** — approved skills are added to a persistent knowledge base and taught to all other agents

## Getting Started

### Prerequisites

- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)
- A [Tavily API key](https://tavily.com/) (for web research)

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd AI-SDR

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and add your keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   TAVILY_API_KEY=tvly-...
```

### Run

```bash
# Start the backend (from the backend/ directory)
uvicorn main:app --reload
```

The API server starts on `http://localhost:8000`.

Then open `index.html` in your browser (no build step needed — it's a static frontend). The UI connects to the backend automatically.

### Quick Start with Demo Mode

Toggle **Demo Mode** in the top-right corner of the UI to see pre-computed conversations without using any API credits.

## Lead CSV Format

Create a CSV file with these columns:

```
name,title,company,email
Sarah Chen,VP of Sales,Lattice HQ,sarah.chen@lattice.com
Marcus Webb,Head of RevOps,Rippling,marcus.webb@rippling.com
```

A sample file (`sample-leads.csv`) is included in the repo.

## Project Structure

```
AI-SDR/
  index.html          # Frontend UI (static, no build step)
  app.js              # Frontend logic and SSE event handling
  styles.css          # UI styles
  sample-leads.csv    # Example lead list
  backend/
    main.py           # FastAPI server, SSE streaming, Johnny's review orchestration
    manager.py        # Agent delegation, conversation simulation, skill review
    agent.py          # Claude API calls, Tavily web search
    prompts.py        # All system prompts (research, scoring, conversation, review)
    knowledge.py      # In-memory knowledge base and learning timeline
    requirements.txt  # Python dependencies
    .env.example      # Environment variable template
```

## Tech Stack

- **Backend:** Python, FastAPI, Server-Sent Events (SSE)
- **AI:** Claude (Anthropic) for conversation simulation and skill review
- **Research:** Tavily for real-time web search on leads
- **Frontend:** Vanilla HTML/JS/CSS (no framework, no build step)
