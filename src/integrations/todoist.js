// src/integrations/todoist.js
// Todoist API v1 — Aufgaben anlegen und heutige Aufgaben lesen.
// Ohne TODOIST_API_TOKEN ist alles ein No-op (wie telegram.js).

const log = require('../utils/log');

const API = 'https://api.todoist.com/api/v1';

function enabled() { return !!process.env.TODOIST_API_TOKEN; }

async function request(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.TODOIST_API_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Todoist HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Legt eine Aufgabe an. `due` ist natürliche Sprache ("morgen", "next monday").
 * @returns {Promise<{ id, content, url }|null>} null wenn nicht konfiguriert
 */
async function createTask({ content, description = '', due = null, labels = [], priority = null }) {
  if (!enabled()) return null;
  const body = { content, description };
  if (due) { body.due_string = due; body.due_lang = process.env.TODOIST_LANG || 'de'; }
  if (labels.length) body.labels = labels;
  if (priority) body.priority = priority;
  if (process.env.TODOIST_PROJECT_ID) body.project_id = process.env.TODOIST_PROJECT_ID;
  const task = await request('POST', '/tasks', body);
  log.info(`[Todoist] Aufgabe angelegt: ${content.slice(0, 60)}`);
  return { id: task.id, content: task.content, due: task.due?.string ?? null, url: `https://app.todoist.com/app/task/${task.id}` };
}

/** Aufgaben per Todoist-Filter, z.B. "today | overdue". */
async function filterTasks(query = 'today | overdue', limit = 30) {
  if (!enabled()) return null;
  const data = await request('GET', `/tasks/filter?query=${encodeURIComponent(query)}&limit=${limit}`);
  const list = Array.isArray(data) ? data : (data?.results ?? []);
  return list.map(t => ({ id: t.id, content: t.content, due: t.due?.string ?? t.due?.date ?? null, priority: t.priority }));
}

module.exports = { enabled, createTask, filterTasks };
