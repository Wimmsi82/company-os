// src/scheduler/cron.js
// Autonomer Dauerbetrieb — alle Jobs registriert
// v4: dynamischer Pulse, queued-topics-Job, Projekt-Weekly

const cron = require('node-cron');
const orchestrator = require('./orchestrator');
const db = require('../db');
const log = require('../utils/log');

const INTERVAL = parseInt(process.env.CYCLE_INTERVAL_MINUTES ?? '60');

function start() {
  log.info(`[Cron] Scheduler startet — Interval: ${INTERVAL} Minuten`);

  // ── Task-Queue + Metrik-Check + Follow-up-Check alle N Minuten ──
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

  // ── Täglicher Strategiepuls — 08:00 Uhr (DYNAMISCH) ──
  cron.schedule('0 8 * * *', async () => {
    log.info('[Cron] Täglicher Strategiepuls …');
    try {
      const topic = orchestrator.buildDynamicPulseTopic();
      log.info(`[Cron] Pulse-Topic: ${topic.slice(0, 100)}`);
      await orchestrator.runDeliberation(topic, 'cron_daily');
    } catch (err) {
      log.error('[Cron] Strategiepuls fehlgeschlagen: ' + err.message);
    }
  });

  // ── Wöchentliches Review + Projekt-Checks — Montag 07:00 ──
  cron.schedule('0 7 * * 1', async () => {
    log.info('[Cron] Wöchentliches Review …');

    // 1. Allgemeines Weekly Review
    try {
      await orchestrator.runDeliberation(
        'Wöchentliches Review: Was wurde letzte Woche erreicht? Was sind die Top-Prioritäten diese Woche? Wo gibt es Blockaden oder offene Follow-ups?',
        'cron_weekly'
      );
    } catch (err) {
      log.error('[Cron] Weekly Review fehlgeschlagen: ' + err.message);
    }

    // 2. Pro aktivem Projekt: eigener Wochen-Check
    try {
      const projects = db.getActiveProjects();
      if (projects.length) {
        log.info(`[Cron] Projekt-Checks für ${projects.length} aktive Projekte …`);
        for (const project of projects) {
          try {
            log.info(`[Cron] Projekt-Check: ${project.name}`);
            await orchestrator.runDeliberation(
              `Wöchentlicher Projekt-Check [${project.name}]: Fortschritt letzte Woche, aktuelle Blockaden, konkrete nächste Schritte. Priorisiert und actionable.`,
              'cron_project',
              project.id
            );
          } catch (err) {
            log.error(`[Cron] Projekt-Check ${project.name} fehlgeschlagen: ${err.message}`);
          }
        }
      }
    } catch (err) {
      log.error('[Cron] Projekt-Checks fehlgeschlagen: ' + err.message);
    }
  });

  // ── CEO-vorgeschlagene Topics alle 2 Stunden abarbeiten ──
  cron.schedule('0 */2 * * *', async () => {
    try {
      const allPending = db.getPendingQueuedTopics();
      const due = allPending.filter(t =>
        !t.scheduled_for || new Date(t.scheduled_for) <= new Date()
      );
      if (!due.length) return;

      log.info(`[Cron] Queued Topics: ${due.length} fällig — verarbeite max 2 …`);
      const batch = due.slice(0, 2);

      for (const t of batch) {
        try {
          log.info(`[Cron] Queued Topic [${t.priority}]: ${t.topic.slice(0, 70)}`);
          db.setQueuedTopicRunning(t.id);
          await orchestrator.runDeliberation(t.topic, 'queued', t.project_id ?? null);
          db.setQueuedTopicDone(t.id);
        } catch (err) {
          log.error(`[Cron] Queued Topic fehlgeschlagen: ${err.message}`);
          db.setQueuedTopicSkipped(t.id);
        }
      }
    } catch (err) {
      log.error('[Cron] Queued-Topics-Job fehlgeschlagen: ' + err.message);
    }
  });

  // ── Follow-up-Check stündlich (unabhängig vom Task-Loop) ──
  cron.schedule('30 * * * *', async () => {
    try {
      await orchestrator.checkFollowups();
    } catch (err) {
      log.error('[Cron] Follow-up-Check fehlgeschlagen: ' + err.message);
    }
  });

  log.info('[Cron] Jobs aktiv:');
  log.info('  · Task-Queue + Metriken + Follow-ups: alle ' + INTERVAL + ' Minuten');
  log.info('  · Täglicher Pulse (dynamisch): 08:00');
  log.info('  · Weekly Review + Projekt-Checks: Montag 07:00');
  log.info('  · Queued Topics (CEO-vorgeschlagen): alle 2 Stunden');
  log.info('  · Follow-up-Check: stündlich :30');
}

module.exports = { start };
