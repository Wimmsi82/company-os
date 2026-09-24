// src/db/index.js
// Query-Layer über die SQLite-DB. Reine Helper-Funktionen, kein ORM.
// Jede Funktion öffnet/nutzt eine lazy geöffnete, gecachte Verbindung.
// Rückgabewerte sind rohe better-sqlite3-Zeilenobjekte (Feldnamen = Spaltennamen).

const Database = require('better-sqlite3');
const { applySchema, dbPath } = require('./migrate');

let _db = null;
let _path = null;

function getDb() {
  const target = dbPath();
  if (_db && _path === target) return _db;
  if (_db) _db.close();
  _db = new Database(target);
  _path = target;
  applySchema(_db); // idempotent — Checkout ohne expliziten `npm run migrate` startet trotzdem
  return _db;
}

function close() {
  if (_db) { _db.close(); _db = null; _path = null; }
}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

// ── TASKS ───────────────────────────────────────────────

function createTask({ from_dept, to_dept, type = 'analysis', priority = 5, title, body, cycle_id = null, project_id = null }) {
  const r = getDb().prepare(`INSERT INTO tasks (from_dept, to_dept, type, priority, title, body, cycle_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(from_dept, to_dept, type, priority, title, body, cycle_id, project_id);
  return r.lastInsertRowid;
}

function setTaskRunning(id) {
  getDb().prepare(`UPDATE tasks SET status = 'running', started_at = ? WHERE id = ?`).run(now(), id);
}
function setTaskDone(id, result) {
  getDb().prepare(`UPDATE tasks SET status = 'done', result = ?, done_at = ? WHERE id = ?`).run(result, now(), id);
}
function setTaskFailed(id, error) {
  getDb().prepare(`UPDATE tasks SET status = 'failed', result = ?, done_at = ? WHERE id = ?`).run(error, now(), id);
}

function getAllPendingTasks() {
  return getDb().prepare(`SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority ASC, created_at ASC, id ASC`).all();
}
function getRecentTasks() {
  return getDb().prepare(`SELECT * FROM tasks ORDER BY created_at DESC, id DESC LIMIT 50`).all();
}

// ── MESSAGES ────────────────────────────────────────────

function createMessage({ from_dept, to_dept, subject = null, body, task_id = null }) {
  const r = getDb().prepare(`INSERT INTO messages (from_dept, to_dept, subject, body, task_id) VALUES (?, ?, ?, ?, ?)`)
    .run(from_dept, to_dept, subject, body, task_id);
  return r.lastInsertRowid;
}
function getUnreadMessages(deptId) {
  return getDb().prepare(`SELECT * FROM messages WHERE to_dept = ? AND read = 0 ORDER BY created_at ASC, id ASC`).all(deptId);
}
function markRead(id) {
  getDb().prepare(`UPDATE messages SET read = 1 WHERE id = ?`).run(id);
}
function getAllMessages() {
  return getDb().prepare(`SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT 100`).all();
}

// ── MEMORY (pro Abteilung) ─────────────────────────────

const GLOBAL_DEPT = 'global';

function getMemory(deptId) {
  return getDb().prepare(`SELECT * FROM memory WHERE dept = ? ORDER BY confidence DESC`).all(deptId);
}
function upsertMemory(deptId, key, value, { confidence = 0.5 } = {}) {
  getDb().prepare(`INSERT INTO memory (dept, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(dept, key) DO UPDATE SET value = excluded.value, confidence = excluded.confidence, updated_at = excluded.updated_at`)
    .run(deptId, key, value, confidence, now());
}
function logMemoryChange(deptId, key, oldValue, newValue) {
  getDb().prepare(`INSERT INTO memory_log (dept, key, old_value, new_value) VALUES (?, ?, ?, ?)`)
    .run(deptId, key, oldValue, newValue);
}
function getMemoryLog(deptId) {
  // id DESC als Tiebreaker: changed_at hat nur Sekundenauflösung (datetime('now')),
  // zwei Änderungen in derselben Sekunde müssen trotzdem "neueste zuerst" bleiben.
  return getDb().prepare(`SELECT * FROM memory_log WHERE dept = ? ORDER BY changed_at DESC, id DESC`).all(deptId);
}
function getAllMemory() {
  return getDb().prepare(`SELECT * FROM memory ORDER BY dept, key`).all();
}

function getGlobalMemory() {
  return getDb().prepare(`SELECT * FROM memory WHERE dept = ?`).all(GLOBAL_DEPT);
}
function upsertGlobalMemory(key, value, source = null) {
  getDb().prepare(`INSERT INTO memory (dept, key, value, source, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(dept, key) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`)
    .run(GLOBAL_DEPT, key, value, source, now());
}

// ── METRICS ─────────────────────────────────────────────

function getAllMetrics() {
  return getDb().prepare(`SELECT * FROM metrics ORDER BY name`).all();
}
function updateMetric(name, value) {
  getDb().prepare(`INSERT INTO metrics (name, value, last_checked, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET value = excluded.value, last_checked = excluded.last_checked, updated_at = excluded.updated_at`)
    .run(name, value, now(), now());
}
function getAlertingMetrics() {
  return getDb().prepare(`SELECT * FROM metrics
    WHERE (threshold_low IS NOT NULL AND value < threshold_low)
       OR (threshold_high IS NOT NULL AND value > threshold_high)`).all();
}

// ── CYCLES ──────────────────────────────────────────────

function createCycle(trigger, topic) {
  const r = getDb().prepare(`INSERT INTO cycles (trigger, trigger_detail) VALUES (?, ?)`).run(trigger, topic);
  return r.lastInsertRowid;
}
function updateCycle(id, status, phases, tokenUsed = 0) {
  getDb().prepare(`UPDATE cycles SET status = ?, phases = ?, token_used = ?, done_at = ? WHERE id = ?`)
    .run(status, JSON.stringify(phases ?? null), tokenUsed, now(), id);
}
function getRecentCycles() {
  return getDb().prepare(`SELECT * FROM cycles ORDER BY started_at DESC, id DESC LIMIT 20`).all();
}

// ── TOKEN-BUDGET ────────────────────────────────────────

function ensureTodayBudget(db) {
  const limit = parseInt(process.env.DAILY_TOKEN_LIMIT ?? '100000');
  db.prepare(`INSERT OR IGNORE INTO token_budget (date, tokens_limit) VALUES (?, ?)`).run(today(), limit);
}
function getTodayBudget() {
  const db = getDb();
  ensureTodayBudget(db);
  return db.prepare(`SELECT * FROM token_budget WHERE date = ?`).get(today());
}
function setBudgetAlertSent() {
  const db = getDb();
  ensureTodayBudget(db);
  db.prepare(`UPDATE token_budget SET alert_sent = 1 WHERE date = ?`).run(today());
}
function trackTokens(tokens, costUsd) {
  const db = getDb();
  ensureTodayBudget(db);
  db.prepare(`UPDATE token_budget SET tokens_used = tokens_used + ?, cost_usd = cost_usd + ? WHERE date = ?`)
    .run(tokens, costUsd, today());
}
function getBudgetHistory() {
  return getDb().prepare(`SELECT * FROM token_budget ORDER BY date DESC LIMIT 30`).all();
}

// ── ESKALATIONEN ────────────────────────────────────────

function createEscalation({ from_dept, question, context = null, task_id = null, cycle_id = null }) {
  const r = getDb().prepare(`INSERT INTO escalations (from_dept, question, context, task_id, cycle_id) VALUES (?, ?, ?, ?, ?)`)
    .run(from_dept, question, context, task_id, cycle_id);
  return r.lastInsertRowid;
}
function getAllEscalations() {
  return getDb().prepare(`SELECT * FROM escalations ORDER BY created_at DESC, id DESC`).all();
}
function getOpenEscalations() {
  return getDb().prepare(`SELECT * FROM escalations WHERE status = 'open' ORDER BY created_at ASC, id ASC`).all();
}
function answerEscalation(id, answer) {
  getDb().prepare(`UPDATE escalations SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?`).run(answer, now(), id);
}
function dismissEscalation(id) {
  getDb().prepare(`UPDATE escalations SET status = 'dismissed' WHERE id = ?`).run(id);
}

// ── FOLLOW-UPS ──────────────────────────────────────────

function createFollowup({ cycle_id = null, condition, check_after }) {
  const r = getDb().prepare(`INSERT INTO followups (cycle_id, condition, check_after) VALUES (?, ?, ?)`)
    .run(cycle_id, condition, check_after);
  return r.lastInsertRowid;
}
function getDueFollowups() {
  return getDb().prepare(`SELECT * FROM followups WHERE status = 'pending' AND check_after <= ? ORDER BY check_after ASC, id ASC`).all(now());
}
function setFollowupTriggered(id) {
  getDb().prepare(`UPDATE followups SET status = 'triggered', triggered_at = ? WHERE id = ?`).run(now(), id);
}
function getAllFollowups() {
  return getDb().prepare(`SELECT * FROM followups ORDER BY created_at DESC, id DESC`).all();
}
function resolveFollowup(id, resolution) {
  getDb().prepare(`UPDATE followups SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?`).run(resolution, now(), id);
}

// ── PROJEKTE ────────────────────────────────────────────

function createProject({ name, description = null, goals = null, constraints = null }) {
  const r = getDb().prepare(`INSERT INTO projects (name, description, goals, constraints) VALUES (?, ?, ?, ?)`)
    .run(name, description, goals, constraints);
  return r.lastInsertRowid;
}
function getAllProjects() {
  return getDb().prepare(`SELECT * FROM projects ORDER BY created_at DESC, id DESC`).all();
}
function getActiveProjects() {
  return getDb().prepare(`SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC, id DESC`).all();
}
function getProjectById(id) {
  return getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
}
function getProjectByName(name) {
  return getDb().prepare(`SELECT * FROM projects WHERE name = ?`).get(name);
}
const PROJECT_FIELDS = ['name', 'description', 'goals', 'constraints', 'status'];
function updateProject(id, updates = {}) {
  const fields = Object.keys(updates).filter(k => PROJECT_FIELDS.includes(k));
  if (!fields.length) return;
  const set = fields.map(f => `${f} = ?`).join(', ');
  getDb().prepare(`UPDATE projects SET ${set}, updated_at = ? WHERE id = ?`)
    .run(...fields.map(f => updates[f]), now(), id);
}
function archiveProject(id) {
  getDb().prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`).run(now(), id);
}

// ── WEBHOOKS ────────────────────────────────────────────

function getWebhookConfig(source) {
  return getDb().prepare(`SELECT * FROM webhook_configs WHERE source = ?`).get(source);
}
function getAllWebhookConfigs() {
  return getDb().prepare(`SELECT * FROM webhook_configs ORDER BY source`).all();
}
function upsertWebhookConfig(source, secret) {
  getDb().prepare(`INSERT INTO webhook_configs (source, secret) VALUES (?, ?)
    ON CONFLICT(source) DO UPDATE SET secret = excluded.secret`).run(source, secret);
}
function createWebhookEvent(source, eventType, payload) {
  const r = getDb().prepare(`INSERT INTO webhook_events (source, event_type, payload) VALUES (?, ?, ?)`)
    .run(source, eventType, JSON.stringify(payload ?? null));
  return r.lastInsertRowid;
}
function setWebhookEventProcessed(id, action) {
  getDb().prepare(`UPDATE webhook_events SET status = 'processed', action = ?, processed_at = ? WHERE id = ?`).run(action, now(), id);
}
function setWebhookEventIgnored(id) {
  getDb().prepare(`UPDATE webhook_events SET status = 'ignored', processed_at = ? WHERE id = ?`).run(now(), id);
}
function setWebhookEventError(id, error) {
  getDb().prepare(`UPDATE webhook_events SET status = 'error', error = ?, processed_at = ? WHERE id = ?`).run(error, now(), id);
}
function getRecentWebhookEvents() {
  return getDb().prepare(`SELECT * FROM webhook_events ORDER BY created_at DESC, id DESC LIMIT 50`).all();
}

// ── QUEUED TOPICS ───────────────────────────────────────

function createQueuedTopic({ topic, reason = null, priority = 'medium', source = 'operator', project_id = null, scheduled_for = null }) {
  const r = getDb().prepare(`INSERT INTO queued_topics (topic, reason, priority, source, project_id, scheduled_for)
    VALUES (?, ?, ?, ?, ?, ?)`).run(topic, reason, priority, source, project_id, scheduled_for);
  return r.lastInsertRowid;
}
function getAllQueuedTopics() {
  return getDb().prepare(`SELECT * FROM queued_topics ORDER BY created_at DESC, id DESC`).all();
}
function getPendingQueuedTopics() {
  return getDb().prepare(`SELECT * FROM queued_topics WHERE status = 'pending'
    ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at ASC, id ASC`).all();
}
function setQueuedTopicRunning(id) {
  getDb().prepare(`UPDATE queued_topics SET status = 'running' WHERE id = ?`).run(id);
}
function setQueuedTopicDone(id) {
  getDb().prepare(`UPDATE queued_topics SET status = 'done' WHERE id = ?`).run(id);
}
function setQueuedTopicSkipped(id) {
  getDb().prepare(`UPDATE queued_topics SET status = 'skipped' WHERE id = ?`).run(id);
}

// ── DYNAMISCHE AGENTEN ──────────────────────────────────

function getDynamicAgents() {
  return getDb().prepare(`SELECT * FROM agents ORDER BY created_at ASC, id ASC`).all();
}
// Wird mit camelCase aufgerufen (systemPrompt, createdBy) — Speicherung snake_case.
function createDynamicAgent({ id, name, systemPrompt, createdBy = null, context = null }) {
  getDb().prepare(`INSERT INTO agents (id, name, system_prompt, created_by, context) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, systemPrompt, createdBy, context);
}
function updateAgentPrompt(id, newPrompt) {
  getDb().prepare(`UPDATE agents SET system_prompt = ?, updated_at = ? WHERE id = ?`).run(newPrompt, now(), id);
}
// Kein Writer für Ratings existiert im Code — sicherer leerer Report statt Annahmen.
function getAgentPerformance() {
  return [];
}

// ── UNTERAGENTEN (Spawn-Mechanismus) ───────────────────

function saveSubagentResult({ parentId, subagentId = null, subagentName = null, task, result }) {
  const str = v => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));
  getDb().prepare(`INSERT INTO subagent_results (parent_id, subagent_id, subagent_name, task, result) VALUES (?, ?, ?, ?, ?)`)
    .run(parentId, subagentId, subagentName, str(task), str(result));
}

module.exports = {
  close,
  // tasks
  createTask, setTaskRunning, setTaskDone, setTaskFailed, getAllPendingTasks, getRecentTasks,
  // messages
  createMessage, getUnreadMessages, markRead, getAllMessages,
  // memory
  getMemory, upsertMemory, logMemoryChange, getMemoryLog, getAllMemory, getGlobalMemory, upsertGlobalMemory,
  // metrics
  getAllMetrics, updateMetric, getAlertingMetrics,
  // cycles
  createCycle, updateCycle, getRecentCycles,
  // budget
  getTodayBudget, setBudgetAlertSent, trackTokens, getBudgetHistory,
  // escalations
  createEscalation, getAllEscalations, getOpenEscalations, answerEscalation, dismissEscalation,
  // followups
  createFollowup, getDueFollowups, setFollowupTriggered, getAllFollowups, resolveFollowup,
  // projects
  createProject, getAllProjects, getActiveProjects, getProjectById, getProjectByName, updateProject, archiveProject,
  // webhooks
  getWebhookConfig, getAllWebhookConfigs, upsertWebhookConfig,
  createWebhookEvent, setWebhookEventProcessed, setWebhookEventIgnored, setWebhookEventError, getRecentWebhookEvents,
  // queued topics
  createQueuedTopic, getAllQueuedTopics, getPendingQueuedTopics,
  setQueuedTopicRunning, setQueuedTopicDone, setQueuedTopicSkipped,
  // dynamic agents
  getDynamicAgents, createDynamicAgent, updateAgentPrompt, getAgentPerformance,
  // subagents
  saveSubagentResult,
};
