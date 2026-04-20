// src/api/routes.js
// REST-API v2 — inkl. Eskalations-Inbox, Budget, Follow-ups

const express = require('express');
const router = express.Router();
const orchestrator = require('../scheduler/orchestrator');
const db = require('../db');
const log = require('../utils/log');

// ── Status ──────────────────────────────────────────────

router.get('/status', (req, res) => {
  const budget = db.getTodayBudget();
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    budget: {
      tokens_used: budget.tokens_used,
      tokens_limit: budget.tokens_limit,
      cost_usd: budget.cost_usd,
      pct: Math.round((budget.tokens_used / budget.tokens_limit) * 100),
    },
    open_escalations: db.getOpenEscalations().length,
  });
});

// ── Deliberation ────────────────────────────────────────

router.post('/run', async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic fehlt' });
  res.json({ ok: true, message: 'Orchestration gestartet', topic });
  orchestrator.runDeliberation(topic, 'manual').catch(err => {
    log.error('[API] /run Fehler: ' + err.message);
  });
});

// ── Tasks ───────────────────────────────────────────────

router.get('/tasks', (req, res) => {
  res.json(db.getRecentTasks());
});

router.post('/tasks', (req, res) => {
  const { from_dept = 'human', to_dept, type = 'analysis', priority = 5, title, body } = req.body;
  if (!to_dept || !title || !body)
    return res.status(400).json({ error: 'to_dept, title und body Pflicht' });
  db.createTask({ from_dept, to_dept, type, priority, title, body, cycle_id: null });
  res.json({ ok: true });
});

// ── Nachrichten ─────────────────────────────────────────

router.get('/messages', (req, res) => {
  res.json(db.getAllMessages());
});

// ── Projekte ────────────────────────────────────────────

router.get('/projects', (req, res) => {
  res.json(db.getAllProjects());
});

router.post('/projects', (req, res) => {
  const { name, description, goals, constraints } = req.body;
  if (!name) return res.status(400).json({ error: 'name Pflicht' });
  if (db.getProjectByName(name)) {
    return res.status(409).json({ error: `Projekt "${name}" existiert bereits` });
  }
  db.createProject({ name, description, goals, constraints });
  const created = db.getProjectByName(name);
  res.json({ ok: true, project: created });
});

router.get('/projects/:id', (req, res) => {
  const project = db.getProjectById(req.params.id) || db.getProjectByName(req.params.id);
  if (!project) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(project);
});

router.patch('/projects/:id', (req, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Nicht gefunden' });
  db.updateProject(req.params.id, req.body);
  res.json({ ok: true });
});

router.delete('/projects/:id/archive', (req, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Nicht gefunden' });
  db.archiveProject(req.params.id);
  res.json({ ok: true });
});

// ── Webhooks ────────────────────────────────────────────

const { handleWebhook } = require('../webhooks/processor');

// Webhook-Empfang: POST /api/webhooks/:source
router.post('/webhooks/:source', express.raw({ type: '*/*' }), async (req, res) => {
  const source  = req.params.source.toLowerCase();
  const rawBody = req.body?.toString?.() ?? '';
  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    return res.status(400).json({ error: 'Ungültiger JSON-Body' });
  }

  const result = await handleWebhook({
    source, rawBody, headers: req.headers, payload,
  }).catch(err => ({ ok: false, error: err.message }));

  res.status(result.ok ? 200 : 400).json(result);
  log.info(`[API] Webhook ${source}: ${result.action ?? result.error}`);
});

// Webhook-Konfiguration anzeigen
router.get('/webhooks', (req, res) => {
  const configs = db.getAllWebhookConfigs();
  res.json(configs.map(c => ({ ...c, secret: c.secret ? '***' : null })));
});

// Secret für eine Quelle setzen
router.post('/webhooks/:source/secret', (req, res) => {
  const { secret } = req.body;
  if (!secret) return res.status(400).json({ error: 'secret Pflicht' });
  db.upsertWebhookConfig(req.params.source, secret);
  res.json({ ok: true, url: `/api/webhooks/${req.params.source}` });
});

// Event-Log
router.get('/webhook-events', (req, res) => {
  res.json(db.getRecentWebhookEvents());
});

// ── Queued Topics ───────────────────────────────────────

router.get('/queued-topics', (req, res) => {
  res.json(db.getAllQueuedTopics());
});

router.post('/queued-topics', (req, res) => {
  const { topic, reason, priority, project_id, scheduled_for } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic Pflicht' });
  db.createQueuedTopic({ topic, reason, priority, source: 'operator', project_id, scheduled_for });
  res.json({ ok: true });
});

router.patch('/queued-topics/:id/skip', (req, res) => {
  db.setQueuedTopicSkipped(req.params.id);
  res.json({ ok: true });
});

// ── Gedächtnis ──────────────────────────────────────────

router.get('/memory', (req, res) => {
  res.json(db.getAllMemory());
});

router.get('/memory/:dept/log', (req, res) => {
  res.json(db.getMemoryLog(req.params.dept));
});

// ── Metriken ────────────────────────────────────────────

router.get('/metrics', (req, res) => {
  res.json(db.getAllMetrics());
});

router.patch('/metrics/:name', (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value fehlt' });
  db.updateMetric(req.params.name, parseFloat(value));
  res.json({ ok: true });
});

// ── Zyklen ──────────────────────────────────────────────

router.get('/cycles', (req, res) => {
  res.json(db.getRecentCycles());
});

// ── Follow-ups ──────────────────────────────────────────

router.get('/followups', (req, res) => {
  res.json(db.getAllFollowups());
});

router.post('/followups/:id/resolve', (req, res) => {
  const { resolution } = req.body;
  db.resolveFollowup(req.params.id, resolution ?? 'Manuell geschlossen');
  res.json({ ok: true });
});

// ── Eskalationen ────────────────────────────────────────

router.get('/escalations', (req, res) => {
  res.json(db.getAllEscalations());
});

router.get('/escalations/open', (req, res) => {
  res.json(db.getOpenEscalations());
});

router.post('/escalations/:id/answer', (req, res) => {
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: 'answer fehlt' });

  db.answerEscalation(req.params.id, answer);

  // Antwort als Nachricht an die fragende Abteilung zurückschicken
  const all = db.getAllEscalations();
  const esc = all.find(e => e.id === req.params.id);
  if (esc) {
    db.createMessage({
      from_dept: 'human',
      to_dept: esc.from_dept,
      subject: `Antwort auf: ${esc.question.slice(0, 60)}`,
      body: answer,
      task_id: esc.task_id,
    });
    log.info(`[API] Eskalation beantwortet → ${esc.from_dept}`);
  }

  res.json({ ok: true });
});

router.post('/escalations/:id/dismiss', (req, res) => {
  db.dismissEscalation(req.params.id);
  res.json({ ok: true });
});

// ── Token-Budget ─────────────────────────────────────────

router.get('/budget', (req, res) => {
  res.json({
    today: db.getTodayBudget(),
    history: db.getBudgetHistory(),
  });
});

// ── Queue manuell triggern ──────────────────────────────

router.post('/process', async (req, res) => {
  res.json({ ok: true, message: 'Queue-Lauf gestartet' });
  orchestrator.processTaskQueue()
    .then(() => orchestrator.checkMetrics())
    .then(() => orchestrator.checkFollowups())
    .catch(err => log.error('[API] /process Fehler: ' + err.message));
});

module.exports = router;
