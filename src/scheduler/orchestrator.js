// src/scheduler/orchestrator.js
// Kern des autonomen Systems — steuert alle Phasen und den Task-Queue-Loop
// v2: Vault-Integration (Input + Output)

const agentRegistry = require('../agents');
const ceo = require('../agents/ceo');
const db = require('../db');
const log = require('../utils/log');
const vault = require('../vault');

// ── DYNAMISCHES PULSE-THEMA ────────────────────────────

function buildDynamicPulseTopic() {
  try {
    const escalations = db.getOpenEscalations();
    const alerts      = db.getAlertingMetrics();
    const pending     = db.getAllPendingTasks();
    const projects    = db.getActiveProjects();
    const queued      = db.getPendingQueuedTopics()
      .filter(t => !t.scheduled_for || new Date(t.scheduled_for) <= new Date());

    const parts = ['Täglicher Unternehmenspuls — Status-Analyse:'];

    if (escalations.length)
      parts.push(`${escalations.length} offene Eskalation${escalations.length > 1 ? 'en' : ''} warten auf Antwort.`);
    if (alerts.length)
      parts.push(`Metriken ausserhalb Schwellenwert: ${alerts.map(a => `${a.name} (${a.value} ${a.unit ?? ''})`).join(', ')}.`);
    if (pending.length > 10)
      parts.push(`${pending.length} Tasks in Queue, davon ${pending.filter(t => t.priority <= 2).length} hochpriorisiert.`);
    if (projects.length)
      parts.push(`Aktive Projekte: ${projects.map(p => p.name).join(', ')}.`);
    if (queued.length)
      parts.push(`${queued.length} Topic${queued.length > 1 ? 's' : ''} vom CEO zur Deliberation vorgeschlagen.`);

    parts.push('Was braucht heute sofortige Aufmerksamkeit? Priorisiere konkret.');
    return parts.join(' ');
  } catch {
    return 'Täglicher Unternehmenspuls: Was sind die wichtigsten Themen heute? Was braucht sofortige Aufmerksamkeit?';
  }
}

// ── MANUELLER LAUF (3-Phasen-Deliberation) ─────────────

async function runDeliberation(topic, trigger = 'manual', projectId = null) {
  const cycleId = db.createCycle(trigger, topic);
  log.info(`[Orchestrator] Zyklus ${cycleId} gestartet — "${topic.slice(0, 80)}"`);

  // ── Projekt-Kontext laden ──
  let projectCtx = '';
  if (projectId) {
    const project = db.getProjectById(projectId);
    if (project) {
      const lines = [];
      if (project.description) lines.push(`- Beschreibung: ${project.description}`);
      if (project.goals)       lines.push(`- Projektziele: ${project.goals}`);
      if (project.constraints) lines.push(`- Constraints:  ${project.constraints}`);
      if (lines.length) {
        projectCtx = `\n\nProjekt-Kontext [${project.name}]:\n` + lines.join('\n');
        log.info(`[Orchestrator] Projekt-Kontext: ${project.name}`);
      }
    }
  }

  // ── Vault-Kontext laden (INPUT) ──
  const vaultContext = vault.readVaultContext(topic);
  if (vaultContext) {
    log.info('[Orchestrator] Vault-Kontext geladen.');
  }

  // Topic mit allen Kontexten anreichern
  const enrichedTopic = [topic, vaultContext, projectCtx].filter(Boolean).join('');

  const allAgents = agentRegistry.list();
  const phase1 = {};
  const phase2 = {};
  let totalTokens = 0;

  // ── Phase 1: Parallele Erstanalyse ──
  log.info('[Orchestrator] Phase 1 — parallele Erstanalyse …');
  await Promise.all(
    allAgents.map(async (agent) => {
      try {
        const text = await agent.analyze(enrichedTopic);
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
        const text = await agent.deliberate(enrichedTopic, phase1);
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

  // ── Vault-Log schreiben (OUTPUT) ──
  vault.writeCycleLog({ cycleId, topic, phase1, phase2, decision });

  return { cycleId, phase1, phase2, decision };
}

// ── AUTONOMER TASK-QUEUE-LOOP ───────────────────────────

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

// ── METRIK-CHECK ────────────────────────────────────────

async function checkMetrics() {
  const alerts = db.getAlertingMetrics();
  if (!alerts.length) return;

  log.warn(`[Orchestrator] ${alerts.length} Metriken außerhalb Schwellenwert.`);

  for (const metric of alerts) {
    const direction = metric.value < metric.threshold_low ? 'unter' : 'über';
    const threshold = metric.value < metric.threshold_low
      ? metric.threshold_low
      : metric.threshold_high;

    const deptMap = {
      monthly_revenue: 'sales',
      pipeline_count: 'sales',
      cash_runway_months: 'finance',
      open_tasks: 'ops',
      team_capacity_pct: 'hr',
    };

    const targetDept = deptMap[metric.name] ?? 'strategy';

    // Immer: Task für zuständige Abteilung
    db.createTask({
      from_dept: 'system',
      to_dept: targetDept,
      type: 'action',
      priority: 2,
      title: `ALERT: ${metric.name} ${direction} Schwellenwert`,
      body: `Metrik "${metric.name}" ist ${direction} dem Schwellenwert.\nAktueller Wert: ${metric.value} ${metric.unit ?? ''}\nSchwellenwert: ${threshold} ${metric.unit ?? ''}\n\nAnalysiere die Situation und schlage konkrete Maßnahmen vor.`,
      cycle_id: null,
    });

    // Alert auch in Vault Inbox schreiben
    vault.writeAlertToInbox(metric.name, metric.value, threshold, targetDept);

    log.warn(`[Orchestrator] Alert-Task erstellt für ${targetDept}: ${metric.name}`);

    // Kritische Abweichung (>2x Schwellenwert): sofortige Deliberation
    const safeValue = metric.value || 0.0001; // Division by zero verhindern
    const criticalRatio = metric.value < (metric.threshold_low ?? Infinity)
      ? (metric.threshold_low / safeValue)
      : (safeValue / (metric.threshold_high ?? safeValue));

    if (criticalRatio > 2.0 && metric.value !== 0) {
      log.warn(`[Orchestrator] KRITISCH: ${metric.name} (Ratio ${criticalRatio.toFixed(1)}x) — Sofort-Deliberation`);
      try {
        await runDeliberation(
          `KRITISCHER ALERT: Metrik "${metric.name}" bei ${metric.value} ${metric.unit ?? ''} — Schwellenwert ${threshold}. Das ist ${criticalRatio.toFixed(1)}x ausserhalb des Normalbereichs. Sofortmassnahmen erforderlich. Alle Abteilungen: Was tun wir jetzt?`,
          'metric_alert'
        );
      } catch (err) {
        log.error(`[Orchestrator] Sofort-Deliberation fehlgeschlagen: ${err.message}`);
      }
    }
  }
}

async function checkFollowups() {
  return ceo.checkFollowups();
}

module.exports = { runDeliberation, processTaskQueue, checkMetrics, checkFollowups, buildDynamicPulseTopic };
