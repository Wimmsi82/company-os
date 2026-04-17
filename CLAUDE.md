# Company OS

## Stack
Runtime: Node.js 18+ (funktioniert auf aarch64/arm64 und x86)
DB: SQLite (better-sqlite3, synchron)
AI: claude.js — unterstuetzt CLI-Modus (Claude Code) und API-Modus (Anthropic API)
Scheduler: node-cron (nur API-Modus)
API: Express 4
Frontend: Vanilla HTML/JS, kein Build-Step

## Commands
```
npm install          # Abhaengigkeiten
npm run migrate      # DB-Schema (einmalig + nach Updates)
npm start            # Server starten (API-Modus)
npm run dev          # Entwicklung mit nodemon
node run.js          # CLI-Einstiegspunkt
```

## Structure
```
run.js               # CLI-Einstiegspunkt (Onboarding, Deliberation)
src/
  agents/base.js     # Basis-Agent: processTask, analyze, deliberate, memory
  agents/index.js    # Agenten-Registry (8 Abteilungen)
  agents/ceo.js      # CEO-Synthese + Action Items + Follow-ups
  scheduler/         # Orchestrator + Cron
  api/claude.js      # CLI/API-Wrapper (CLAUDE_MODE in .env)
  api/routes.js      # REST-API
  db/migrate.js      # Schema
  db/index.js        # Query-Layer
  ui/index.html      # Dashboard
```

## Rules
- Plain Node.js — kein TypeScript, kein Build-Step
- try/catch in jedem Agent-Aufruf
- Alle Claude-Calls ueber src/api/claude.js
- Kein API Key im Code — process.env.ANTHROPIC_API_KEY
- SQLite-Writes mit Transaktion wenn mehrere zusammengehoeren
- Vor Dateiaenderungen: lesen, dann handeln
- Nach Aenderungen: docs/CHANGELOG.md aktualisieren

## Agent Response Format (JSON)
{
  "analysis": "text",
  "tasks_for_others": [{ "to_dept", "type", "priority", "title", "body" }],
  "messages_to": [{ "to_dept", "subject", "body" }],
  "memory_updates": [{ "key", "value", "confidence", "reasoning" }],
  "needs_human_decision": false,
  "human_question": null,
  "human_context": null
}

## Env
CLAUDE_MODE=cli|api
ANTHROPIC_API_KEY=    (nur API-Modus)
CLAUDE_MODEL=claude-sonnet-4-20250514
PORT=3000
CYCLE_INTERVAL_MINUTES=60
MAX_AGENT_CALLS_PER_CYCLE=20
DAILY_TOKEN_LIMIT=100000
LOG_LEVEL=info

## Docs
@docs/PRD.md
@docs/SYSTEM_DESIGN.md
@docs/FEATURES.md
@docs/CHANGELOG.md
@INSTALL.md
