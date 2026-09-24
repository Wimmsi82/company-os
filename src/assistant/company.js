// src/assistant/company.js
// Company-OS-Zugriff für den Assistenten. DB und Orchestrator werden erst
// bei Bedarf geladen, damit der Chat (Vault, Todoist) auch ohne sie läuft.

function db() { return require('../db'); }

function status() {
  const d = db();
  const budget   = d.getTodayBudget();
  const esc      = d.getOpenEscalations();
  const pending  = d.getAllPendingTasks();
  const cycles   = d.getRecentCycles().slice(0, 3);
  return {
    budget: { tokens_used: budget.tokens_used, tokens_limit: budget.tokens_limit },
    open_escalations: esc.length,
    pending_tasks: pending.length,
    high_priority_tasks: pending.filter(t => t.priority <= 2).length,
    recent_cycles: cycles.map(c => ({
      id: c.id, status: c.status, trigger: c.trigger,
      topic: String(c.trigger_detail ?? '').slice(0, 100), started: c.started_at,
    })),
  };
}

function openEscalations() {
  return db().getOpenEscalations().map(e => ({
    id: e.id, from: e.from_dept, question: e.question, context: e.context, created: e.created_at,
  }));
}

/** Eskalation per ID oder eindeutigem ID-Präfix beantworten. */
function answerEscalation(idOrPrefix, answer) {
  const open = db().getOpenEscalations();
  const matches = open.filter(e => String(e.id) === idOrPrefix || String(e.id).startsWith(idOrPrefix));
  if (!matches.length) throw new Error(`Keine offene Eskalation mit ID ${idOrPrefix}`);
  if (matches.length > 1) throw new Error(`ID ${idOrPrefix} ist nicht eindeutig (${matches.length} Treffer)`);
  return require('../services/escalations').answerEscalation(matches[0].id, answer);
}

/** Startet eine Deliberation im Hintergrund (läuft über Claude, nicht Bonsai). */
function startDeliberation(topic, onDone) {
  const orchestrator = require('../scheduler/orchestrator');
  orchestrator.runDeliberation(topic, 'assistant')
    .then(r => onDone?.(null, r))
    .catch(err => onDone?.(err));
}

/** Kurzer Text-Block für den LLM-Kontext; leer wenn Company OS nicht verfügbar. */
function contextBlock() {
  try {
    const s = status();
    const esc = openEscalations().slice(0, 5);
    const lines = [
      `Offene Eskalationen: ${s.open_escalations}, offene Tasks: ${s.pending_tasks} (davon hochprior: ${s.high_priority_tasks}).`,
      ...esc.map(e => `- Eskalation ${String(e.id).slice(0, 8)} von ${e.from}: ${e.question}`),
      ...s.recent_cycles.map(c => `- Zyklus ${c.id} (${c.status}): ${c.topic}`),
    ];
    return lines.join('\n');
  } catch {
    return '';
  }
}

module.exports = { status, openEscalations, answerEscalation, startDeliberation, contextBlock };
