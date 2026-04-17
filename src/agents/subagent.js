// src/agents/subagent.js
// Unteragent — wird von einem Haupt-Agenten gespawnt und geloest sich nach Abschluss auf

const claude = require('../api/claude');
const log = require('../utils/log');

class SubAgent {
  constructor({ parentId, parentName, id, name, role, task }) {
    this.parentId = parentId;
    this.parentName = parentName;
    this.id = `${parentId}_${id}`;
    this.name = name;
    this.role = role;
    this.task = task;
  }

  async run(taskOverride) {
    const task = taskOverride || this.task;
    log.info(`[${this.parentName}>${this.name}] Unteragent laeuft: ${String(task).slice(0, 60)}`);

    const systemPrompt = `Du bist ein spezialisierter Unteragent mit der Rolle: ${this.role}.
Du wurdest von ${this.parentName} beauftragt um eine spezifische Teilaufgabe zu erledigen.
Liefere praezise, fokussierte Ergebnisse. Nur das was beauftragt wurde. Deutsch.`;

    try {
      const { text } = await claude.call(systemPrompt, `Aufgabe: ${task}\n\nLiefere dein Ergebnis praezise und strukturiert.`);
      log.info(`[${this.parentName}>${this.name}] Unteragent abgeschlossen`);
      return text;
    } catch (err) {
      log.error(`[${this.parentName}>${this.name}] Fehler: ${err.message}`);
      return `Fehler: ${err.message}`;
    }
  }
}

module.exports = SubAgent;
