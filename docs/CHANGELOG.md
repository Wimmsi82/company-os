# CHANGELOG — Company OS

## [2026-04-20] — v4 Maximale Autonomie

- Erstellt: `queued_topics`-Tabelle — CEO und Operator können Deliberationsthemen vorausplanen
- Geändert: `src/agents/ceo.js` — neues JSON-Feld `next_topics`: CEO schlägt nach jeder Synthese eigenständig nächste Deliberationen vor (max 2, mit Scheduling)
- Geändert: `src/agents/ceo.js` — CEO System-Prompt: explizit angewiesen nächste Themen zu queuen wenn nötig
- Geändert: `src/scheduler/orchestrator.js` — `buildDynamicPulseTopic()`: liest DB-State (Eskalationen, Metriken, Tasks, Projekte, Queue) und baut dynamisches Topic statt hartem String
- Geändert: `src/scheduler/orchestrator.js` — `runDeliberation(topic, trigger, projectId)`: neues optionales `projectId`-Argument mit Projekt-Kontext-Injektion
- Geändert: `src/scheduler/orchestrator.js` — `checkMetrics()`: kritische Metriken (>2x Schwellenwert) triggern sofortige Deliberation statt nur Task
- Geändert: `src/scheduler/cron.js` — Daily Pulse 08:00 nutzt `buildDynamicPulseTopic()` statt hartem String
- Geändert: `src/scheduler/cron.js` — Weekly (Mo 07:00) läuft danach automatisch pro aktivem Projekt einen eigenen Wochen-Check
- Geändert: `src/scheduler/cron.js` — neuer Job alle 2h: verarbeitet fällige queued_topics (max 2 pro Durchlauf, priority-sorted)
- Geändert: `src/api/routes.js` — neue Endpoints: GET/POST `/api/queued-topics`, PATCH `/api/queued-topics/:id/skip`
- User-Impact: System läuft 24/7 autonom auf Pi; CEO plant nächste Themen selbst; täglicher Pulse reagiert auf aktuellen Systemzustand; kritische Metriken eskalieren sofort

Autonomie-Ablauf nach Deployment:
```
08:00  → Dynamischer Daily Pulse (liest Eskalationen, Metriken, Tasks, Projekte)
alle 2h → CEO-vorgeschlagene Topics abarbeiten
60min  → Task-Queue + Metrik-Check (kritisch → sofort Deliberation) + Follow-ups
Mo 7:00 → Weekly + pro aktivem Projekt eigener Wochen-Check
:30/h  → Follow-up-Check
```

## [2026-04-20] — v3 Kontext-Hierarchie (Mission → Projekt → Task)

Inspiriert von Paperclip: Projektkontexte ergänzen den globalen Unternehmenskontext als mittlere Schicht.

- Erstellt: `projects`-Tabelle in SQLite (name, description, goals, constraints, status)
- Geändert: `tasks`-Tabelle — neue Spalte `project_id` (nullable FK)
- Geändert: `src/db/migrate.js` — Schema + retroaktive Migration für bestehende DBs
- Geändert: `src/db/index.js` — createProject, getAllProjects, getProjectById/ByName, updateProject, archiveProject
- Geändert: `run.js` — `buildGlobalContextPrompt(project)` baut 3-Schicht-Kontext
- Geändert: `run.js` — neue CLI-Befehle: `--new-project`, `--projects`, `--project "Name" "Frage"`, `--project-consultant`
- Geändert: `run.js` — `runDeliberation()` akzeptiert `projectId`, lädt Projekt aus DB, injiziert Kontext
- Geändert: `src/api/routes.js` — neue Endpoints: GET/POST `/api/projects`, GET/PATCH `/api/projects/:id`, DELETE `/api/projects/:id/archive`
- User-Impact: Agenten sehen jetzt Mission → Projekt → Task als dreistufigen Kontext-Stack

Kontext-Stack für Agenten:
```
Unternehmenskontext (Mission):  ← global_memory (company_context, goals, ...)
  Projekt-Kontext [Projektname]: ← projects.description / .goals / .constraints
    Frage / Aufgabe              ← task.body / deliberation topic
```

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
