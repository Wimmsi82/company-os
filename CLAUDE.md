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

## Wartezeit-UX (seit 2026-08-18)

Skill `.claude/skills/wartezeit-ux/` ist committed (kein `.gitignore`-Ausschluss dafuer).
Audit: `docs/audit-wartezeit-2026-08-18.md`. `src/ui/index.html` ist die einzige
Frontend-Datei (Vanilla JS, kein Framework, kein Build-Step) — die Bausteine bleiben
entsprechend simpel:

- **`fetchJSON(url, opts)`** (Anfang des `<script>`-Blocks) ersetzt jedes
  `fetch(...).then(r=>r.json()).catch(() => [])`: prueft `resp.ok`, wirft sonst.
  Jede `load*()`-Funktion faengt das ab und zeigt einen eigenen `role="alert"`-Text
  statt des Leer-Zustands ("Keine Tasks." etc.) — ein totes Backend darf nie
  aussehen wie ein leerer, aber funktionierender Account.
- **`confirmDialog(message)`** / **`promptDialog(message, default)`** ersetzen
  `window.confirm`/`window.prompt` (Focus-Trap, Escape-to-close, Fokus-Rueckgabe).
  Neue destruktive Aktionen gehen darueber, nie ueber die Browser-Dialoge.
- **ARIA-Ladezustaende**: die statischen "Lade …"-Platzhalter im HTML tragen
  `role="status"`; die dynamisch generierten Fehlertexte in den `catch`-Bloecken
  tragen `role="alert"`. Die eigentliche Erfolgs-Ansicht (Tabelle/Karten) bekommt
  bewusst **kein** dauerhaftes `aria-live` — die Views werden nach jeder
  Nutzeraktion (Antworten, Loeschen, Erstellen) neu gerendert; ein persistentes
  Live-Attribut wuerde bei jeder Routine-Aktion den ganzen Bereich erneut vorlesen.
- **`#hStatusError`** (Header) zeigt/versteckt sich nur bei einem tatsaechlichen
  Zustandswechsel von `loadStatus()` (nicht bei jedem der 30s-Polls) — verhindert
  wiederholte Announcements bei anhaltendem Backend-Ausfall UND vermeidet, dass
  die feste Log-Zeile "Dashboard verbunden" unabhaengig vom echten Ergebnis steht.
- Buttons mit Seiteneffekt (10 Stellen: Deliberation starten, Queue, Eskalation
  beantworten/ablehnen, Task/Projekt anlegen, Follow-up schliessen, Metrik
  speichern, Projekt archivieren/deliberieren) werden waehrend des Requests
  `disabled` + `aria-busy`, sonst erzeugt ein Doppelklick doppelte Eintraege.
- `@media (prefers-reduced-motion: reduce)` deaktiviert die `.pulse`-Animation.

## Docs
@docs/PRD.md
@docs/SYSTEM_DESIGN.md
@docs/FEATURES.md
@docs/CHANGELOG.md
@INSTALL.md
