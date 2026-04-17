# FEATURES — Company OS

## Feature 1: 3-Phasen-Deliberation

**User Story:** Als Operator gebe ich ein Thema ein und erhalte eine strukturierte Entscheidungsgrundlage mit CEO-Synthese.

Tasks:
→ POST /api/run empfängt topic, startet async
→ Phase 1: alle Agenten parallel via Promise.all
→ Phase 2: jeder Agent liest alle phase1-Outputs, deliberiert
→ Phase 3: CEO-Agent synthetisiert → Entscheidung + Handlungsplan
→ Cycle in DB gespeichert mit allen Phasen als JSON

User-Impact: Operator bekommt in ~2 Minuten 3 Perspektivschichten statt null.

---

## Feature 2: Autonomer Task-Queue-Loop

**User Story:** Als Operator möchte ich dass Abteilungen sich gegenseitig beauftragen ohne mein Zutun.

Tasks:
→ Cron läuft alle N Minuten (CYCLE_INTERVAL_MINUTES)
→ getAllPendingTasks() holt offene Tasks sortiert nach Priorität
→ Zuständiger Agent ruft processTask() auf
→ Agent-Response als JSON: analysis + tasks_for_others + messages_to + memory_updates
→ Folge-Tasks landen sofort in der Queue
→ MAX_AGENT_CALLS_PER_CYCLE verhindert Token-Explosion

User-Impact: System arbeitet im Hintergrund weiter, auch wenn Operator offline ist.

---

## Feature 3: Agent-Gedächtnis

**User Story:** Als Operator möchte ich dass Agenten frühere Erkenntnisse kennen.

Tasks:
→ memory-Tabelle: UNIQUE(dept, key) — upsert bei jedem Update
→ Jeder Agent lädt sein Gedächtnis vor dem API-Call
→ Gedächtnis wird als Kontext an Claude übergeben
→ Agent kann expires_at setzen (temporäres Wissen)
→ confidence 0.0–1.0 für Unsicherheitsgrad

User-Impact: Agenten werden über Zeit besser — sie kennen den Kontext des Unternehmens.

---

## Feature 4: Metrik-Monitoring mit Auto-Reaktion

**User Story:** Als Operator setze ich Schwellenwerte und das System reagiert automatisch.

Tasks:
→ metrics-Tabelle mit threshold_low / threshold_high
→ checkMetrics() läuft nach jedem Queue-Lauf
→ Bei Alert: Task an zuständige Abteilung mit Priorität 2
→ PATCH /api/metrics/:name zum Setzen aktueller Werte
→ Dashboard zeigt Alert-Status farblich

User-Impact: Kein manuelles Monitoring nötig — kritische Werte lösen automatisch Analyse aus.

---

## Feature 5: Nachrichten-Bus

**User Story:** Als Operator möchte ich sehen wie Abteilungen miteinander kommunizieren.

Tasks:
→ messages-Tabelle mit from_dept / to_dept / read-Flag
→ Agent liest ungelesene Nachrichten vor jedem Task
→ Nachrichten werden als Kontext an Claude übergeben
→ GET /api/messages liefert alle Nachrichten ans Dashboard
→ 'all' als to_dept = Broadcast an alle

User-Impact: Transparenz über interne Kommunikation zwischen Agenten.

---

## Feature 6: Web-Dashboard

**User Story:** Als Operator möchte ich den Systemstand per Browser einsehen.

Tasks:
→ src/ui/index.html — statisch, kein Build-Step
→ Auto-Refresh alle 30 Sekunden
→ Ansichten: Metriken, Task-Queue, Nachrichten, Gedächtnis, Zyklen, Live-Log
→ Manueller Start von Deliberation und Queue-Run
→ Erreichbar unter http://192.168.188.153:3000

User-Impact: Vollständige Übersicht ohne SSH.

---

## Feature 7: systemd-Service

**User Story:** Als Operator läuft das System nach Pi-Neustart automatisch weiter.

Tasks:
→ company-os.service — Restart=always, RestartSec=10
→ EnvironmentFile lädt .env
→ journalctl -u company-os für Logs
→ systemctl enable für Autostart

User-Impact: Echter 24/7-Betrieb, kein manueller Start nach Stromausfall.
