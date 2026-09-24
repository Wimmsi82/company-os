// src/services/escalations.js
// Eskalation beantworten — gemeinsam genutzt von REST-API und Assistent.

const db  = require('../db');
const log = require('../utils/log');

/**
 * Beantwortet eine Eskalation und schickt die Antwort als Nachricht
 * an die fragende Abteilung zurück.
 * @returns {object|null} die Eskalation oder null wenn unbekannt
 */
function answerEscalation(id, answer) {
  const esc = db.getAllEscalations().find(e => e.id === id);
  if (!esc) return null;

  db.answerEscalation(id, answer);
  db.createMessage({
    from_dept: 'human',
    to_dept: esc.from_dept,
    subject: `Antwort auf: ${esc.question.slice(0, 60)}`,
    body: answer,
    task_id: esc.task_id,
  });
  log.info(`[Eskalation] beantwortet → ${esc.from_dept}`);
  return esc;
}

module.exports = { answerEscalation };
