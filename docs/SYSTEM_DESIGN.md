# SYSTEM DESIGN — Company OS

## Architektur

```
┌─────────────────────────────────────────────────────┐
│  Browser (Dashboard)                                 │
│  src/ui/index.html                                   │
└────────────────────┬────────────────────────────────┘
                     │ HTTP REST
┌────────────────────▼────────────────────────────────┐
│  Express API  (src/api/routes.js)  :3000             │
│  POST /api/run   GET /api/tasks    GET /api/metrics  │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Orchestrator  (src/scheduler/orchestrator.js)       │
│  runDeliberation()   processTaskQueue()              │
│  checkMetrics()                                      │
└──────┬─────────────┬────────────────┬───────────────┘
       │             │                │
┌──────▼──────┐ ┌────▼────┐ ┌────────▼──────────────┐
│  Agent Pool │ │  CEO    │ │  Cron Scheduler        │
│  8 Agenten  │ │  Agent  │ │  src/scheduler/cron.js │
│  base.js    │ │  ceo.js │ │  täglich 08:00         │
└──────┬──────┘ └────┬────┘ │  wöchentlich Mo 07:00  │
       │             │      └────────────────────────┘
       │             │
┌──────▼─────────────▼──────────────────────────────┐
│  Claude API Wrapper  (src/api/claude.js)            │
│  call()   multiTurn()   getTokensUsed()             │
└──────────────────────┬─────────────────────────────┘
                       │ HTTPS
                  Anthropic API

┌──────────────────────────────────────────────────┐
│  SQLite DB  (db/company-os.sqlite)                │
│  tasks · messages · memory · metrics · cycles     │
└──────────────────────────────────────────────────┘
```

## Ablauf: 3-Phasen-Deliberation

```
Trigger (manual | cron | metric_alert)
    │
    ▼
Phase 1 ─── alle 8 Agenten parallel ──► phase1[dept] = text
    │
    ▼
Phase 2 ─── alle 8 Agenten parallel ──► jeder liest phase1 aller anderen
    │         deliberate() → phase2[dept] = text
    ▼
Phase 3 ─── CEO Agent ─────────────► synthesize(phase1, phase2)
    │         → Entscheidung + Handlungsplan
    ▼
    DB: cycle gespeichert, CEO-Task in tasks-Tabelle
```

## Ablauf: Autonomer Task-Queue-Loop

```
Cron alle N Minuten
    │
    ▼
processTaskQueue()
    ├── getAllPendingTasks() aus SQLite
    ├── für jeden Task: agent.processTask(task)
    │       ├── Gedächtnis laden (memory-Tabelle)
    │       ├── Ungelesene Nachrichten laden
    │       ├── Claude API Call (JSON-Response)
    │       ├── Folge-Tasks erstellen (tasks-Tabelle)
    │       ├── Nachrichten senden (messages-Tabelle)
    │       └── Gedächtnis aktualisieren
    └── checkMetrics() → Alert-Tasks bei Schwellenwerten
```

## DB Schema

```sql
tasks    (id, from_dept, to_dept, type, priority, title, body,
          status, result, created_at, started_at, done_at, cycle_id)

messages (id, from_dept, to_dept, subject, body, read,
          created_at, task_id)

memory   (id, dept, key, value, confidence, expires_at,
          created_at, updated_at)   UNIQUE(dept, key)

metrics  (id, name, value, unit, threshold_low, threshold_high,
          last_checked, created_at, updated_at)

cycles   (id, trigger, trigger_detail, status, phases,
          started_at, done_at, token_used)
```

## API Endpoints

| Method | Path                  | Beschreibung                        |
|--------|-----------------------|-------------------------------------|
| GET    | /api/status           | Uptime, Timestamp                   |
| POST   | /api/run              | Deliberation starten {topic}        |
| GET    | /api/tasks            | Letzte 50 Tasks                     |
| POST   | /api/tasks            | Task manuell erstellen              |
| GET    | /api/messages         | Letzte 100 Nachrichten              |
| GET    | /api/memory           | Gesamtes Agent-Gedächtnis           |
| GET    | /api/metrics          | Alle Metriken                       |
| PATCH  | /api/metrics/:name    | Metrik-Wert setzen {value}          |
| GET    | /api/cycles           | Letzte 20 Zyklen                    |
| POST   | /api/process          | Task-Queue manuell triggern         |

## Agent-Kommunikation

Agenten kommunizieren ausschließlich über die DB — nie direkt:

```
Agent A → db.createTask(to_dept: 'finance', ...)
                    ↓
         Nächster Cron-Tick
                    ↓
         finance.processTask(task)
                    ↓
         db.setTaskDone(task.id, result)
                    ↓
         finance → db.createMessage(to_dept: 'strategy', ...)
```

## Deployment auf Pi

```bash
ssh admin@192.168.188.153
cd ~/Dev
git clone <repo> company-os
cd company-os
cp .env.example .env
nano .env                        # API-Key eintragen
npm install
npm run migrate
sudo cp company-os.service /etc/systemd/system/
sudo systemctl enable company-os
sudo systemctl start company-os
```

Dashboard erreichbar unter: http://192.168.188.153:3000
