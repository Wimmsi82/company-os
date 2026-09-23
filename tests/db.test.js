// tests/db.test.js — Reconstructed src/db (schema was missing from the repo,
// rebuilt from every call site across the codebase). Exercises each function
// group with a throwaway SQLite file per run.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let db, dbFile;

before(() => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cos-db-')), 'test.sqlite');
  process.env.DB_PATH = dbFile;
  process.env.DAILY_TOKEN_LIMIT = '5000';
  db = require('../src/db');
});
after(() => { db.close(); fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }); });

test('tasks: create, transition status, pending is priority-ordered, recent limited', () => {
  const lo = db.createTask({ from_dept: 'ceo', to_dept: 'finance', priority: 5, title: 'B', body: 'x' });
  const hi = db.createTask({ from_dept: 'ceo', to_dept: 'finance', priority: 1, title: 'A', body: 'x', cycle_id: 3 });
  assert.deepStrictEqual(db.getAllPendingTasks().map(t => t.id), [hi, lo]);

  db.setTaskRunning(hi);
  assert.strictEqual(db.getAllPendingTasks().length, 1);
  db.setTaskDone(hi, 'ok');
  db.setTaskFailed(lo, 'boom');
  const recent = db.getRecentTasks();
  assert.strictEqual(recent.find(t => t.id === hi).status, 'done');
  assert.strictEqual(recent.find(t => t.id === hi).result, 'ok');
  assert.strictEqual(recent.find(t => t.id === lo).status, 'failed');
});

test('messages: unread → markRead removes it from the unread list', () => {
  const id = db.createMessage({ from_dept: 'finance', to_dept: 'ceo', subject: 'S', body: 'B' });
  assert.strictEqual(db.getUnreadMessages('ceo').length, 1);
  db.markRead(id);
  assert.strictEqual(db.getUnreadMessages('ceo').length, 0);
  assert.ok(db.getAllMessages().some(m => m.id === id));
});

test('memory: dept-scoped upsert/log, global memory separate from dept memory', () => {
  db.upsertMemory('finance', 'burn_rate', '10k', { confidence: 0.6 });
  db.logMemoryChange('finance', 'burn_rate', null, '10k');
  db.upsertMemory('finance', 'burn_rate', '12k', { confidence: 0.8 });
  db.logMemoryChange('finance', 'burn_rate', '10k', '12k');
  assert.strictEqual(db.getMemory('finance')[0].value, '12k');
  assert.strictEqual(db.getMemoryLog('finance').length, 2);
  assert.strictEqual(db.getMemoryLog('finance')[0].new_value, '12k'); // newest first

  db.upsertGlobalMemory('company_context', 'B2B SaaS', 'operator');
  assert.strictEqual(db.getGlobalMemory().length, 1);
  assert.strictEqual(db.getGlobalMemory()[0].key, 'company_context');
  assert.strictEqual(db.getMemory('finance').some(m => m.key === 'company_context'), false);
  assert.ok(db.getAllMemory().some(m => m.dept === 'global') && db.getAllMemory().some(m => m.dept === 'finance'));
});

test('metrics: updateMetric upserts, getAlertingMetrics only returns out-of-range rows', () => {
  db.updateMetric('churn_rate', 3);
  db.getDb?.();
  const withThresholds = require('../src/db');
  // set thresholds directly since updateMetric only touches value/last_checked
  const raw = new (require('better-sqlite3'))(dbFile);
  raw.prepare(`UPDATE metrics SET threshold_low = 1, threshold_high = 5 WHERE name = 'churn_rate'`).run();
  raw.close();
  assert.strictEqual(db.getAlertingMetrics().length, 0);
  db.updateMetric('churn_rate', 9);
  assert.strictEqual(db.getAlertingMetrics().length, 1);
  assert.strictEqual(db.getAllMetrics().find(m => m.name === 'churn_rate').value, 9);
});

test('cycles: createCycle returns id, updateCycle stores JSON phases and singular token_used', () => {
  const id = db.createCycle('manual', 'Expansion DACH?');
  assert.strictEqual(typeof id, 'number');
  db.updateCycle(id, 'done', { phase1: { strategy: 'x' }, phase2: {}, decision: 'JA' }, 1234);
  const row = db.getRecentCycles().find(c => c.id === id);
  assert.strictEqual(row.trigger_detail, 'Expansion DACH?');
  assert.strictEqual(row.token_used, 1234);
  assert.deepStrictEqual(JSON.parse(row.phases).phase1, { strategy: 'x' });
});

test('token budget: auto-creates today, trackTokens accumulates, alert flag sticky', () => {
  const b0 = db.getTodayBudget();
  assert.strictEqual(b0.tokens_used, 0);
  assert.strictEqual(b0.tokens_limit, 5000);
  db.trackTokens(100, 0.01);
  db.trackTokens(50, 0.005);
  const b1 = db.getTodayBudget();
  assert.strictEqual(b1.tokens_used, 150);
  assert.ok(Math.abs(b1.cost_usd - 0.015) < 1e-9);
  assert.strictEqual(b1.alert_sent, 0);
  db.setBudgetAlertSent();
  assert.strictEqual(db.getTodayBudget().alert_sent, 1);
  assert.ok(db.getBudgetHistory().some(d => d.date === b1.date));
});

test('escalations: open → answered writes answer, dismiss sets status', () => {
  const id = db.createEscalation({ from_dept: 'finance', question: 'Budget freigeben?' });
  assert.strictEqual(db.getOpenEscalations().length, 1);
  db.answerEscalation(id, 'Ja, 50k');
  assert.strictEqual(db.getOpenEscalations().length, 0);
  assert.strictEqual(db.getAllEscalations().find(e => e.id === id).answer, 'Ja, 50k');
  const id2 = db.createEscalation({ from_dept: 'legal', question: 'x?' });
  db.dismissEscalation(id2);
  assert.strictEqual(db.getAllEscalations().find(e => e.id === id2).status, 'dismissed');
});

test('followups: due only when check_after has passed, resolve closes it', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 3600000).toISOString();
  const dueId = db.createFollowup({ cycle_id: 1, condition: 'Umsatz > 10k?', check_after: past });
  db.createFollowup({ cycle_id: 1, condition: 'später', check_after: future });
  assert.deepStrictEqual(db.getDueFollowups().map(f => f.id), [dueId]);
  db.setFollowupTriggered(dueId);
  assert.strictEqual(db.getDueFollowups().length, 0);
  db.resolveFollowup(dueId, 'Erledigt');
  assert.strictEqual(db.getAllFollowups().find(f => f.id === dueId).status, 'resolved');
});

test('projects: unique name, active filter, partial update ignores unknown keys, archive', () => {
  db.createProject({ name: 'Berthos', description: 'Marine IoT', goals: 'Seed sichern' });
  assert.throws(() => db.createProject({ name: 'Berthos' }));
  assert.strictEqual(db.getActiveProjects().length, 1);
  const p = db.getProjectByName('Berthos');
  db.updateProject(p.id, { goals: 'Seed 800k', evil_column: 'DROP TABLE tasks' });
  assert.strictEqual(db.getProjectById(p.id).goals, 'Seed 800k');
  db.archiveProject(p.id);
  assert.strictEqual(db.getActiveProjects().length, 0);
  assert.strictEqual(db.getProjectById(p.id).status, 'archived');
});

test('webhooks: config upsert, event lifecycle', () => {
  db.upsertWebhookConfig('stripe', 'whsec_123');
  db.upsertWebhookConfig('stripe', 'whsec_456');
  assert.strictEqual(db.getWebhookConfig('stripe').secret, 'whsec_456');
  assert.strictEqual(db.getAllWebhookConfigs().length, 1);

  const evId = db.createWebhookEvent('stripe', 'invoice.paid', { amount: 42 });
  assert.strictEqual(typeof evId, 'number');
  db.setWebhookEventProcessed(evId, 'task');
  assert.strictEqual(db.getRecentWebhookEvents()[0].event_type, 'invoice.paid');
  assert.strictEqual(db.getRecentWebhookEvents()[0].action, 'task');

  const evId2 = db.createWebhookEvent('hubspot', 'contact.created', {});
  db.setWebhookEventIgnored(evId2);
  const evId3 = db.createWebhookEvent('generic', 'x', {});
  db.setWebhookEventError(evId3, 'kaputt');
  assert.strictEqual(db.getRecentWebhookEvents().find(e => e.id === evId3).error, 'kaputt');
});

test('queued topics: string priority ordering (high before medium/low), skip', () => {
  const low = db.createQueuedTopic({ topic: 'C', priority: 'low' });
  const high = db.createQueuedTopic({ topic: 'A', priority: 'high' });
  const med = db.createQueuedTopic({ topic: 'B' }); // default medium
  assert.deepStrictEqual(db.getPendingQueuedTopics().map(t => t.id), [high, med, low]);
  db.setQueuedTopicRunning(high);
  db.setQueuedTopicDone(high);
  db.setQueuedTopicSkipped(low);
  assert.deepStrictEqual(db.getPendingQueuedTopics().map(t => t.id), [med]);
  assert.strictEqual(db.getAllQueuedTopics().length, 3);
});

test('dynamic agents: camelCase input stored as snake_case, duplicate id throws, updateAgentPrompt no-op for unknown id', () => {
  db.createDynamicAgent({ id: 'ai_ethics', name: 'AI Ethics', systemPrompt: 'Du bist...', createdBy: 'ceo', context: 'ctx' });
  const row = db.getDynamicAgents().find(a => a.id === 'ai_ethics');
  assert.strictEqual(row.system_prompt, 'Du bist...');
  assert.strictEqual(row.created_by, 'ceo');
  assert.throws(() => db.createDynamicAgent({ id: 'ai_ethics', name: 'dup', systemPrompt: 'x' }));
  db.updateAgentPrompt('ai_ethics', 'Neuer Prompt');
  assert.strictEqual(db.getDynamicAgents().find(a => a.id === 'ai_ethics').system_prompt, 'Neuer Prompt');
  assert.doesNotThrow(() => db.updateAgentPrompt('strategy', 'x')); // core agent, no row — must not throw
  assert.deepStrictEqual(db.getAgentPerformance(), []);
});

test('subagent results: accepts object task/result and stringifies them', () => {
  assert.doesNotThrow(() => db.saveSubagentResult({
    parentId: 'marketing', subagentId: 'seo-research', subagentName: 'SEO Researcher',
    task: { goal: 'Keywords finden' }, result: { keywords: ['a', 'b'] },
  }));
});
