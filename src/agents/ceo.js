// src/agents/ceo.js
// CEO-Agent: Synthese + Action Items + Follow-ups + dynamische Agent-Erstellung

const claude = require('../api/claude');
const db = require('../db');
const log = require('../utils/log');

const CEO_SYSTEM = `Du bist der CEO. Du erhaeltst Analysen aller Abteilungen und formulierst eine klare Entscheidung. Du erkennst wenn eine wichtige Perspektive fehlt und kannst neue Abteilungen vorschlagen. Du erkennst auch wenn ein Thema eine eigene Deliberation erfordert und kannst diese fuer den naechsten Zyklus vorschlagen (max 2). Direkt, keine Floskeln. Deutsch.`;

async function synthesize({ topic, phase1, phase2, cycleId }) {
  log.info('[CEO] Synthese startet ...');

  const existingAgents = Object.keys(phase1).join(', ');
  const p1ctx = Object.entries(phase1).map(([d, t]) => `[${d}]: ${t}`).join('\n\n');
  const p2ctx = Object.entries(phase2).map(([d, t]) => `[${d}]: ${t}`).join('\n\n');

  const prompt = `Aufgabe: ${topic}

Aktive Abteilungen: ${existingAgents}

=== ERSTANALYSEN ===
${p1ctx}

=== DELIBERATIONSRUNDE ===
${p2ctx}

Antworte im folgenden JSON-Format:
{
  "decision": "ja|nein|bedingt",
  "decision_text": "klare Formulierung",
  "reasoning": "welche Abteilungen gaben den Ausschlag",
  "action_items": [
    {
      "owner": "abteilungsname",
      "action": "konkrete Aufgabe",
      "deadline_days": 7
    }
  ],
  "main_risk": "Hauptrisiko",
  "risk_mitigation": "Gegenmassnahme",
  "followups": [
    {
      "condition": "messbare Bedingung",
      "check_after_days": 30
    }
  ],
  "escalation_needed": false,
  "escalation_question": null,
  "missing_perspectives": [
    {
      "id": "eindeutiger_slug_ohne_leerzeichen",
      "name": "Abteilungsname",
      "reason": "warum diese Perspektive gefehlt hat",
      "system_prompt": "Du bist [Rolle]. Deine Aufgaben: [konkret]. Antworte praezise, direkt. Deutsch.",
      "context": "Erstellt fuer Thema: ${topic}"
    }
  ],
  "next_topics": [
    {
      "topic": "Konkretes Thema das deliberiert werden soll",
      "reason": "Warum jetzt relevant und warum nicht spaeter",
      "priority": "high|medium|low",
      "days_from_now": 1
    }
  ]
}

Wichtig zu missing_perspectives:
- Nur vorschlagen wenn eine Perspektive WIRKLICH gefehlt hat und den Ausgang beeinflusst haette
- Maximal 2 neue Agenten pro Zyklus
- id muss einzigartig und ein einfacher Slug sein (z.B. customer_success, sustainability, data_science)
- Wenn keine Perspektive fehlt: leeres Array []

Wichtig zu next_topics:
- Nur wenn eine Folgefrage WIRKLICH eine eigene Deliberation braucht (nicht als Action Item loesbar)
- Maximal 2 pro Zyklus — next_topics = [] wenn nichts Dringliches offen bleibt
- days_from_now: 1 = morgen, 7 = naechste Woche, etc.

Nur JSON.`;

  const { text, tokens } = await claude.call(CEO_SYSTEM, prompt, { max_tokens: 2000 });
  const result = _parseResult(text);

  // CEO-Entscheidung speichern
  db.createTask({
    from_dept: 'ceo',
    to_dept: 'all',
    type: 'decision',
    priority: 1,
    title: `CEO: ${topic.slice(0, 80)}`,
    body: JSON.stringify(result),
    cycle_id: cycleId,
  });

  // Action Items delegieren
  (result.action_items ?? []).forEach(item => {
    const due = new Date();
    due.setDate(due.getDate() + (item.deadline_days ?? 7));
    db.createTask({
      from_dept: 'ceo',
      to_dept: item.owner,
      type: 'action',
      priority: 2,
      title: item.action.slice(0, 100),
      body: `CEO-Auftrag: ${item.action}\n\nFaellig: ${due.toLocaleDateString('de-AT')}\nKontext: ${result.decision_text}`,
      cycle_id: cycleId,
    });
    log.info(`[CEO] Action-Task → ${item.owner}: ${item.action.slice(0, 50)}`);
  });

  // Follow-ups anlegen
  (result.followups ?? []).forEach(fu => {
    const checkAfter = new Date();
    checkAfter.setDate(checkAfter.getDate() + (fu.check_after_days ?? 30));
    try {
      db.createFollowup({
        cycle_id: cycleId,
        condition: fu.condition,
        check_after: checkAfter.toISOString(),
      });
      log.info(`[CEO] Follow-up in ${fu.check_after_days}d: ${fu.condition.slice(0, 50)}`);
    } catch {}
  });

  // Eskalation
  if (result.escalation_needed && result.escalation_question) {
    try {
      db.createEscalation({
        from_dept: 'ceo',
        question: result.escalation_question,
        context: `Thema: ${topic}\nEntscheidung: ${result.decision_text}`,
        cycle_id: cycleId,
      });
      log.warn(`[CEO] Eskalation: ${result.escalation_question.slice(0, 60)}`);
    } catch {}
  }

  // Dynamische Agenten erstellen
  const newAgents = [];
  (result.missing_perspectives ?? []).forEach(agent => {
    if (!agent.id || !agent.name || !agent.system_prompt) return;

    // Slug bereinigen
    const safeId = agent.id.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);

    try {
      const agentRegistry = require('./index');
      const existing = agentRegistry.get(safeId);
      if (existing) {
        log.info(`[CEO] Agent "${agent.name}" existiert bereits — kein Duplikat.`);
        return;
      }

      agentRegistry.addDynamicAgent({
        id: safeId,
        name: agent.name,
        systemPrompt: agent.system_prompt,
        createdBy: 'ceo',
        context: agent.context ?? `Erstellt fuer: ${topic}`,
      });

      newAgents.push(agent.name);
      log.info(`[CEO] Neuer Agent erstellt: ${agent.name} (${safeId}) — ${agent.reason}`);

      // Sofort ersten Task an neuen Agenten schicken
      db.createTask({
        from_dept: 'ceo',
        to_dept: safeId,
        type: 'analysis',
        priority: 3,
        title: `Erstanalyse: ${topic.slice(0, 60)}`,
        body: `Du wurdest als neue Abteilung "${agent.name}" erstellt weil: ${agent.reason}\n\nBitte liefere deine Einschaetzung zu: ${topic}\n\nKontext der bisherigen Deliberation:\n${p1ctx.slice(0, 1000)}`,
        cycle_id: cycleId,
      });

    } catch (err) {
      log.error(`[CEO] Agent-Erstellung fehlgeschlagen: ${err.message}`);
    }
  });

  // Nächste Deliberationsthemen in Queue einreihen
  const queuedTopics = [];
  (result.next_topics ?? []).slice(0, 2).forEach(t => {
    if (!t.topic) return;
    try {
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + (t.days_from_now ?? 1));
      db.createQueuedTopic({
        topic: t.topic,
        reason: t.reason ?? null,
        priority: t.priority ?? 'medium',
        source: 'ceo',
        scheduled_for: scheduledFor.toISOString(),
      });
      queuedTopics.push(t.topic);
      log.info(`[CEO] Nächstes Topic queued (${t.priority}, in ${t.days_from_now ?? 1}d): ${t.topic.slice(0, 60)}`);
    } catch (err) {
      log.error(`[CEO] Topic-Queue fehlgeschlagen: ${err.message}`);
    }
  });

  log.info(`[CEO] Synthese abgeschlossen — ${tokens} Tokens`);

  return {
    text: formatDecision(result, newAgents, queuedTopics),
    tokens,
    raw: result,
    newAgents,
    queuedTopics,
  };
}

// ── FOLLOW-UP CHECK ────────────────────────────────────

async function checkFollowups() {
  let due = [];
  try { due = db.getDueFollowups(); } catch { return; }
  if (!due.length) return;

  log.info(`[CEO] ${due.length} faellige Follow-ups ...`);
  for (const fu of due) {
    try { db.setFollowupTriggered(fu.id); } catch {}
    db.createTask({
      from_dept: 'ceo',
      to_dept: 'strategy',
      type: 'analysis',
      priority: 3,
      title: `Follow-up: ${fu.condition.slice(0, 80)}`,
      body: `CEO Follow-up aus Zyklus ${fu.cycle_id}.\n\nBedingung: ${fu.condition}\n\nIst die Bedingung erfuellt? Welche Konsequenz hat das?`,
      cycle_id: null,
    });
  }
}

// ── HILFSMETHODEN ─────────────────────────────────────

function formatDecision(result, newAgents = [], queuedTopics = []) {
  if (!result.decision_text) return JSON.stringify(result, null, 2);
  const lines = [
    `Entscheidung: ${result.decision?.toUpperCase()} — ${result.decision_text}`,
    ``,
    `Begruendung: ${result.reasoning}`,
    ``,
    `Massnahmen:`,
    ...(result.action_items ?? []).map((a, i) => `  ${i+1}. [${a.owner}] ${a.action} (${a.deadline_days}d)`),
    ``,
    `Hauptrisiko: ${result.main_risk}`,
    `Gegenmassnahme: ${result.risk_mitigation}`,
  ];
  if (result.followups?.length) {
    lines.push(``, `Follow-ups:`);
    result.followups.forEach(f => lines.push(`  - In ${f.check_after_days}d: ${f.condition}`));
  }
  if (newAgents.length) {
    lines.push(``, `Neue Abteilungen erstellt:`);
    newAgents.forEach(n => lines.push(`  + ${n} — wird beim naechsten Lauf aktiv`));
  }
  if (queuedTopics.length) {
    lines.push(``, `Naechste Deliberationen geplant:`);
    queuedTopics.forEach(t => lines.push(`  → ${t.slice(0, 80)}`));
  }
  return lines.join('\n');
}

function _parseResult(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return {
      decision: 'offen',
      decision_text: text,
      reasoning: '',
      action_items: [],
      main_risk: '',
      risk_mitigation: '',
      followups: [],
      escalation_needed: false,
      escalation_question: null,
      missing_perspectives: [],
    };
  }
}

module.exports = { synthesize, checkFollowups };
