// src/scheduler/orchestrator.js
// Kern des autonomen Systems — steuert alle Phasen und den Task-Queue-Loop

const agentRegistry = require('../agents');
const ceo = require('../agents/ceo');
const db = require('../db');
const log = require('../utils/log');

// ── MANUELLER LAUF (3-Phasen-Deliberation) ─────────────

async function runDeliberation(topic, trigger = 'manual') {
  const cycleId = db.createCycle(trigger, topic);
  log.info(`[Orchestrator] Zyklus ${cycleId} gestartet — "${topic}"`);

  const allAgents = agentRegistry.list();
  const phase1 = {};
  const phase2 = {};
  let totalTokens = 0;

  // ── Phase 1: Parallele Erstanalyse ──
  log.info('[Orchestrator] Phase 1 — parallele Erstanalyse …');
  await Promise.all(
    allAgents.map(async (agent) => {
      try {
        const text = await agent.analyze(topic);
        phase1[agent.id] = text;
        log.info(`[Orchestrator] Phase 1 ✓ ${agent.name}`);
      } catch (err) {
        phase1[agent.id] = `Fehler: ${err.message}`;
        log.error(`[Orchestrator] Phase 1 ✗ ${agent.name}: ${err.message}`);
      }
    })
  );

  // ── Phase 2: Deliberation (jeder liest alle anderen) ──
  log.info('[Orchestrator] Phase 2 — Deliberation …');
  await Promise.all(
    allAgents.map(async (agent) => {
      try {
        const text = await agent.deliberate(topic, phase1);
        phase2[agent.id] = text;
        log.info(`[Orchestrator] Phase 2 ✓ ${agent.name}`);
      } catch (err) {
        phase2[agent.id] = `Fehler: ${err.message}`;
        log.error(`[Orchestrator] Phase 2 ✗ ${agent.name}: ${err.message}`);
      }
    })
  );

  // ── Phase 3: CEO-Synthese ──
  log.info('[Orchestrator] Phase 3 — CEO-Synthese …');
  const { text: decision, tokens: ceoTokens } = await ceo.synthesize({
    topic, phase1, phase2, cycleId
  });
  totalTokens += ceoTokens;

  db.updateCycle(cycleId, 'done', { phase1, phase2, decision }, totalTokens);
  log.info(`[Orchestrator] Zyklus ${cycleId} abgeschlossen.`);

  return { cycleId, phase1, phase2, decision };
}

// ── AUTONOMER TASK-QUEUE-LOOP ───────────────────────────
// Läuft durch alle pending Tasks und bearbeitet sie sequenziell

async function processTaskQueue() {
  const pending = db.getAllPendingTasks();
  if (!pending.length) {
    log.debug('[Orchestrator] Task-Queue leer.');
    return 0;
  }

  log.info(`[Orchestrator] Task-Queue: ${pending.length} offene Tasks.`);
  let processed = 0;
  const maxCalls = parseInt(process.env.MAX_AGENT_CALLS_PER_CYCLE ?? '20');

  for (const task of pending) {
    if (processed >= maxCalls) {
      log.warn(`[Orchestrator] Limit erreicht (${maxCalls} Calls/Zyklus).`);
      break;
    }

    const agent = agentRegistry.get(task.to_dept);
    if (!agent) {
      // 'all' Tasks: erste verfügbare Abteilung
      if (task.to_dept === 'all') {
        for (const a of agentRegistry.list()) {
          await a.processTask(task);
          processed++;
        }
      } else {
        db.setTaskFailed(task.id, `Unbekannte Abteilung: ${task.to_dept}`);
      }
      continue;
    }

    await agent.processTask(task);
    processed++;
  }

  log.info(`[Orchestrator] ${processed} Tasks verarbeitet.`);
  return processed;
}

// ── METRIK-CHECK: Autonome Reaktion auf Schwellenwerte ──

async function checkMetrics() {
  const alerts = db.getAlertingMetrics();
  if (!alerts.length) return;

  log.warn(`[Orchestrator] ${alerts.length} Metriken außerhalb Schwellenwert.`);

  for (const metric of alerts) {
    const direction = metric.value < metric.threshold_low ? 'unter' : 'über';
    const threshold = metric.value < metric.threshold_low
      ? metric.threshold_low
      : metric.threshold_high;

    // Automatisch relevante Abteilung benachrichtigen
    const deptMap = {
      monthly_revenue: 'sales',
      pipeline_count: 'sales',
      cash_runway_months: 'finance',
      open_tasks: 'ops',
      team_capacity_pct: 'hr',
    };

    const targetDept = deptMap[metric.name] ?? 'strategy';

    db.createTask({
      from_dept: 'system',
      to_dept: targetDept,
      type: 'action',
      priority: 2,
      title: `ALERT: ${metric.name} ${direction} Schwellenwert`,
      body: `Metrik "${metric.name}" ist ${direction} dem Schwellenwert.\nAktueller Wert: ${metric.value} ${metric.unit ?? ''}\nSchwellenwert: ${threshold} ${metric.unit ?? ''}\n\nAnalysiere die Situation und schlage konkrete Maßnahmen vor. Beauftrage bei Bedarf andere Abteilungen.`,
      cycle_id: null,
    });

    log.warn(`[Orchestrator] Alert-Task erstellt für ${targetDept}: ${metric.name}`);
  }
}

async function checkFollowups() {
  return ceo.checkFollowups();
}

module.exports = { runDeliberation, processTaskQueue, checkMetrics, checkFollowups };
