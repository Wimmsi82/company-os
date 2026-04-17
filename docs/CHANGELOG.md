# CHANGELOG — Company OS

## [2026-04-14] — Initiales Setup

- Erstellt: vollständige Projektstruktur unter ~/Dev/company-os
- Erstellt: src/db/migrate.js — SQLite-Schema (tasks, messages, memory, metrics, cycles)
- Erstellt: src/db/index.js — Query-Helpers und DB-API
- Erstellt: src/api/claude.js — zentraler Anthropic-Wrapper
- Erstellt: src/agents/base.js — Basis-Agent-Klasse mit processTask, analyze, deliberate
- Erstellt: src/agents/index.js — 8 Abteilungs-Agenten (Strategie, Finanzen, Marketing, Sales, HR, F&E, Legal, Ops)
- Erstellt: src/agents/ceo.js — CEO-Synthese-Agent
- Erstellt: src/scheduler/orchestrator.js — runDeliberation, processTaskQueue, checkMetrics
- Erstellt: src/scheduler/cron.js — autonomer Scheduler (täglich, wöchentlich, Queue-Loop)
- Erstellt: src/api/routes.js — REST-API (10 Endpoints)
- Erstellt: src/index.js — Express-Server + Cron-Start
- Erstellt: src/ui/index.html — Web-Dashboard
- Erstellt: company-os.service — systemd-Unit für Pi
- User-Impact: System lauffähig nach npm install && npm run migrate && npm start

## [2026-04-15] — v2 Optimierungen

- Geändert: src/api/claude.js — Token-Budget-Prüfung vor jedem API-Call, Kostentracking, 80%-Alert-Eskalation
- Geändert: src/agents/base.js — Gedächtnis nach Confidence sortiert, memory_log Verlauf, Eskalations-Antworten als Kontext, reasoning-Feld in memory_updates
- Geändert: src/agents/ceo.js — JSON-Response-Format, Action Items als direkte Tasks an Abteilungen, Follow-up-Einträge mit Prüfdatum, eigene Eskalation wenn nötig
- Geändert: src/scheduler/orchestrator.js — checkFollowups() ergänzt
- Geändert: src/scheduler/cron.js — stündlicher Follow-up-Check
- Geändert: src/api/routes.js — 6 neue Endpoints: escalations (GET/POST answer/dismiss), followups (GET/resolve), budget (GET), memory log (GET), status erweitert
- Geändert: src/db/migrate.js — 4 neue Tabellen: token_budget, escalations, followups, memory_log
- Geändert: src/db/index.js — alle neuen Query-Helpers
- Geändert: src/ui/index.html — vollständiges Dashboard v2: Tab-Navigation, Eskalations-Inbox mit Antwort-Funktion, Budget-Bar mit History, Follow-up-Cards, Metriken inline editierbar
- Geändert: CLAUDE.md — auf v2 aktualisiert
- User-Impact: System eskaliert Budget-Warnungen und Human-Decisions in Inbox. CEO delegiert Action Items direkt. Follow-ups werden automatisch getriggert.
