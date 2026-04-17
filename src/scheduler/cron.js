// src/scheduler/cron.js
// Autonomer Dauerbetrieb — alle Jobs registriert

const cron = require('node-cron');
const orchestrator = require('./orchestrator');
const log = require('../utils/log');

const INTERVAL = parseInt(process.env.CYCLE_INTERVAL_MINUTES ?? '60');

function start() {
  log.info(`[Cron] Scheduler startet — Interval: ${INTERVAL} Minuten`);

  // Task-Queue + Metrik-Check + Follow-up-Check alle N Minuten
  cron.schedule(`*/${INTERVAL} * * * *`, async () => {
    log.info('[Cron] Automatischer Zyklus …');
    try {
      await orchestrator.processTaskQueue();
      await orchestrator.checkMetrics();
      await orchestrator.checkFollowups();
    } catch (err) {
      log.error('[Cron] Fehler im Zyklus: ' + err.message);
    }
  });

  // Täglicher Strategiepuls — 08:00 Uhr
  cron.schedule('0 8 * * *', async () => {
    log.info('[Cron] Täglicher Strategiepuls …');
    try {
      await orchestrator.runDeliberation(
        'Täglicher Unternehmenspuls: Was sind die wichtigsten Themen heute? Was braucht sofortige Aufmerksamkeit? Welche offenen Tasks oder Eskalationen liegen an?',
        'cron'
      );
    } catch (err) {
      log.error('[Cron] Strategiepuls fehlgeschlagen: ' + err.message);
    }
  });

  // Wöchentliches Review — Montag 07:00
  cron.schedule('0 7 * * 1', async () => {
    log.info('[Cron] Wöchentliches Review …');
    try {
      await orchestrator.runDeliberation(
        'Wöchentliches Review: Was wurde letzte Woche erreicht? Was sind die Top-Prioritäten diese Woche? Wo gibt es Blockaden oder offene Follow-ups?',
        'cron'
      );
    } catch (err) {
      log.error('[Cron] Weekly Review fehlgeschlagen: ' + err.message);
    }
  });

  // Follow-up-Check stündlich (unabhängig vom Task-Loop)
  cron.schedule('30 * * * *', async () => {
    try {
      await orchestrator.checkFollowups();
    } catch (err) {
      log.error('[Cron] Follow-up-Check fehlgeschlagen: ' + err.message);
    }
  });

  log.info('[Cron] Jobs aktiv: Task-Queue, Strategiepuls (08:00), Weekly Review (Mo 07:00), Follow-up-Check (stündlich)');
}

module.exports = { start };
