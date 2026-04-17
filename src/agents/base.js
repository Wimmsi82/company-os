// src/agents/base.js
// v3: Unteragenten, Spawn-Mechanismus, Selbstverbesserung

const claude = require('../api/claude');
const db = require('../db');
const log = require('../utils/log');

class BaseAgent {
  constructor({ id, name, systemPrompt }) {
    this.id = id;
    this.name = name;
    this.systemPrompt = systemPrompt;
    this._subagentResults = {};
  }

  // ── Unteragenten spawnen ────────────────────────────
  // Agent beauftragt spezialisierte Unter-Agenten und wartet auf Ergebnisse

  async spawn(subagentDef, task) {
    const SubAgent = require('./subagent');
    const sub = new SubAgent({
      parentId: this.id,
      parentName: this.name,
      ...subagentDef,
    });
    log.info(`[${this.name}] spawnt Unteragent: ${subagentDef.name}`);
    const result = await sub.run(task);
    this._subagentResults[subagentDef.id] = result;
    db.saveSubagentResult({
      parentId: this.id,
      subagentId: subagentDef.id,
      subagentName: subagentDef.name,
      task,
      result,
    });
    return result;
  }

  // ── Aufgabe bearbeiten ──────────────────────────────

  async processTask(task) {
    log.info(`[${this.name}] Bearbeite Task: ${task.title}`);
    db.setTaskRunning(task.id);

    const memory = db.getMemory(this.id);
    const globalMem = db.getGlobalMemory().filter(g => !g.value.includes('['));
    const memCtx = this._buildMemoryContextV2(memory, globalMem);
    const memLog = db.getMemoryLog(this.id);
    const memLogCtx = memLog.length
      ? '\n\nLetzte Gedaechtnis-Aenderungen:\n' + memLog.slice(0, 5)
          .map(m => `- ${m.key}: "${m.old_value}" => "${m.new_value}" (${m.changed_at.slice(0,10)})`)
          .join('\n')
      : '';

    const msgs = db.getUnreadMessages(this.id);
    const msgCtx = msgs.length
      ? '\n\nEingegangene Nachrichten:\n' + msgs.map(m => `Von ${m.from_dept}: [${m.subject}] ${m.body}`).join('\n')
      : '';
    msgs.forEach(m => db.markRead(m.id));

    const answeredEsc = db.getAllEscalations()
      .filter(e => e.from_dept === this.id && e.status === 'answered' && e.answer)
      .slice(0, 3);
    const escalCtx = answeredEsc.length
      ? '\n\nBeantwortete Operator-Fragen:\n' + answeredEsc.map(e => `F: ${e.question}\nA: ${e.answer}`).join('\n---\n')
      : '';

    // Unteragenten-Ergebnisse aus vorherigen Spawns
    const subCtx = Object.keys(this._subagentResults).length
      ? '\n\nErgebnisse meiner Unteragenten:\n' + Object.entries(this._subagentResults)
          .map(([id, r]) => `[${id}]: ${r}`).join('\n\n')
      : '';

    const prompt = `${task.body}${memCtx}${memLogCtx}${msgCtx}${escalCtx}${subCtx}

WICHTIG: Nutze gespeichertes Wissen aktiv. Aktualisiere Gedaechtnis bei relevantem Erkenntnisgewinn.
Du kannst Unteragenten beauftragen wenn du spezialisierte Analyse brauchst.

Antworte im JSON-Format:
{
  "analysis": "Deine Einschaetzung (3-5 Saetze)",
  "spawn_subagents": [
    {
      "id": "subagent_slug",
      "name": "Name des Unteragenten",
      "role": "spezialisierte Rolle",
      "task": "konkrete Aufgabe fuer diesen Unteragenten"
    }
  ],
  "tasks_for_others": [
    { "to_dept": "abteilung", "type": "analysis|action|decision", "priority": 1-10, "title": "Titel", "body": "Kontext" }
  ],
  "messages_to": [
    { "to_dept": "abteilung oder all", "subject": "Betreff", "body": "Nachricht" }
  ],
  "memory_updates": [
    { "key": "schluessel", "value": "wert", "confidence": 0.0-1.0, "reasoning": "warum wichtig" }
  ],
  "needs_human_decision": false,
  "human_question": null,
  "human_context": null
}
Nur JSON.`;

    try {
      const { text, tokens } = await claude.call(this.systemPrompt, prompt);
      const result = this._parseResult(text);

      // Unteragenten spawnen wenn beauftragt
      if (result.spawn_subagents?.length) {
        for (const sub of result.spawn_subagents) {
          try {
            await this.spawn(sub, sub.task);
          } catch (e) {
            log.error(`[${this.name}] Unteragent-Fehler: ${e.message}`);
          }
        }
      }

      db.setTaskDone(task.id, JSON.stringify(result));

      (result.tasks_for_others ?? []).forEach(t => {
        db.createTask({
          from_dept: this.id, to_dept: t.to_dept,
          type: t.type ?? 'analysis', priority: t.priority ?? 5,
          title: t.title, body: t.body, cycle_id: task.cycle_id,
        });
        log.info(`[${this.name}] => Task an ${t.to_dept}: ${t.title}`);
      });

      (result.messages_to ?? []).forEach(m => {
        db.createMessage({ from_dept: this.id, to_dept: m.to_dept, subject: m.subject, body: m.body, task_id: task.id });
      });

      (result.memory_updates ?? []).forEach(m => {
        const existing = db.getMemory(this.id).find(e => e.key === m.key);
        db.upsertMemory(this.id, m.key, m.value, { confidence: m.confidence });
        db.logMemoryChange(this.id, m.key, existing?.value ?? null, m.value);
      });

      if (result.needs_human_decision && result.human_question) {
        db.createEscalation({
          from_dept: this.id, question: result.human_question,
          context: result.human_context ?? `Task: ${task.title}`,
          task_id: task.id, cycle_id: task.cycle_id,
        });
        log.warn(`[${this.name}] Eskalation: ${result.human_question}`);
      }

      return { success: true, result, tokens };

    } catch (err) {
      db.setTaskFailed(task.id, err.message);
      log.error(`[${this.name}] Fehler: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Erstanalyse (Phase 1) ───────────────────────────

  async analyze(topic) {
    const memory = db.getMemory(this.id);
    const globalMem = db.getGlobalMemory().filter(g => !g.value.includes('['));
    const memCtx = this._buildMemoryContextV2(memory, globalMem);
    const { text } = await claude.call(
      this.systemPrompt,
      `Aufgabe: ${topic}${memCtx}\n\nLiefere eine praezise Einschaetzung (3-5 Saetze). Nutze gespeichertes Wissen. Kein JSON.`
    );
    return text;
  }

  // ── Deliberation (Phase 2) ──────────────────────────

  async deliberate(topic, allAnalyses) {
    const memory = db.getMemory(this.id);
    const globalMem = db.getGlobalMemory().filter(g => !g.value.includes('['));
    const memCtx = this._buildMemoryContextV2(memory, globalMem);
    const ctx = Object.entries(allAnalyses)
      .filter(([dept]) => dept !== this.id)
      .map(([dept, text]) => `[${dept}]: ${text}`).join('\n\n');
    const { text } = await claude.call(
      this.systemPrompt,
      `Aufgabe: ${topic}${memCtx}\n\nErstanalysen:\n${ctx}\n\nReagiere in 2-3 Saetzen. Wo stimmst du zu, wo nicht? Nenn Abteilungen beim Namen.`
    );
    return text;
  }

  // ── Verhandlung (Phase 2b) ──────────────────────────
  // Agent verhandelt direkt mit einem anderen Agenten

  async negotiate(topic, counterpartId, counterpartName, counterpartPosition, round = 1) {
    const memory = db.getMemory(this.id);
    const globalMem = db.getGlobalMemory().filter(g => !g.value.includes('['));
    const memCtx = this._buildMemoryContextV2(memory, globalMem);
    const { text } = await claude.call(
      this.systemPrompt,
      `Verhandlungsthema: ${topic}${memCtx}

Gegenposition von ${counterpartName}:
${counterpartPosition}

Runde ${round}: Reagiere auf die Gegenposition. Verteidle deinen Standpunkt sachlich, mache wenn noetig Zugestaendnisse, strebe eine Einigung an. 2-4 Saetze. Kein JSON.`
    );
    return text;
  }

  // ── Selbstbewertung (fuer Meta-Agent) ──────────────

  async selfEvaluate(topic, ownAnalysis, actualOutcome) {
    const { text } = await claude.call(
      this.systemPrompt,
      `Thema: ${topic}

Meine Einschaetzung war:
${ownAnalysis}

Was tatsaechlich passiert ist:
${actualOutcome}

Bewerte deine Einschaetzung ehrlich: Was war richtig, was falsch, was habe ich uebersehen? 3-4 Saetze.`
    );
    return text;
  }

  // ── Prompt-Verbesserung akzeptieren ────────────────

  updateSystemPrompt(newPrompt) {
    this.systemPrompt = newPrompt;
    try {
      db.updateAgentPrompt(this.id, newPrompt);
      log.info(`[${this.name}] System-Prompt aktualisiert`);
    } catch {}
  }

  // ── Hilfsmethoden ───────────────────────────────────

  _buildMemoryContextV2(deptMemory, globalMem = []) {
    const parts = [];
    if (globalMem.length) {
      parts.push('Unternehmenskontext:\n' + globalMem.map(g => `- ${g.key}: ${g.value}`).join('\n'));
    }
    if (deptMemory.length) {
      const sorted = [...deptMemory].sort((a, b) => b.confidence - a.confidence);
      parts.push('Mein Wissen:\n' + sorted.map(m => `- [${(m.confidence*100).toFixed(0)}%] ${m.key}: ${m.value}`).join('\n'));
    }
    return parts.length ? '\n\n' + parts.join('\n\n') : '';
  }

  _buildMemoryContext(memory) {
    return this._buildMemoryContextV2(memory);
  }

  _parseResult(text) {
    const clean = text.replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); }
    catch {
      return {
        analysis: text, spawn_subagents: [], tasks_for_others: [],
        messages_to: [], memory_updates: [],
        needs_human_decision: false, human_question: null, human_context: null,
      };
    }
  }
}

module.exports = BaseAgent;
