// src/db/migrate.js
// SQLite-Schema für Company OS. Idempotent (CREATE TABLE IF NOT EXISTS) —
// kann bei jedem Deploy erneut laufen. `npm run migrate` ruft dies als CLI
// auf; src/db/index.js wendet dasselbe Schema zusätzlich beim ersten
// Verbindungsaufbau an, damit ein frischer Checkout auch ohne expliziten
// `migrate`-Schritt startet (wie bei src/vault/indexer.js und
// src/assistant/history.js).

const fs   = require('fs');
const path = require('path');

function dbPath() {
  return process.env.DB_PATH || path.join(__dirname, '../../db/company-os.sqlite');
}

function applySchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_dept  TEXT NOT NULL,
      to_dept    TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'analysis',
      priority   INTEGER NOT NULL DEFAULT 5,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      result     TEXT,
      cycle_id   INTEGER,
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      done_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_to_dept  ON tasks(to_dept);

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_dept  TEXT NOT NULL,
      to_dept    TEXT NOT NULL,
      subject    TEXT,
      body       TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      task_id    INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_to_dept ON messages(to_dept, read);

    CREATE TABLE IF NOT EXISTS memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dept       TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      source     TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(dept, key)
    );

    CREATE TABLE IF NOT EXISTS memory_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dept       TEXT NOT NULL,
      key        TEXT NOT NULL,
      old_value  TEXT,
      new_value  TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_memory_log_dept ON memory_log(dept);

    CREATE TABLE IF NOT EXISTS metrics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL UNIQUE,
      value          REAL,
      unit           TEXT,
      threshold_low  REAL,
      threshold_high REAL,
      last_checked   TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger        TEXT NOT NULL,
      trigger_detail TEXT,
      status         TEXT NOT NULL DEFAULT 'running',
      phases         TEXT,
      token_used     INTEGER NOT NULL DEFAULT 0,
      started_at     TEXT NOT NULL DEFAULT (datetime('now')),
      done_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS token_budget (
      date         TEXT PRIMARY KEY,
      tokens_used  INTEGER NOT NULL DEFAULT 0,
      tokens_limit INTEGER NOT NULL DEFAULT 100000,
      cost_usd     REAL NOT NULL DEFAULT 0,
      alert_sent   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_dept   TEXT NOT NULL,
      question    TEXT NOT NULL,
      context     TEXT,
      task_id     INTEGER,
      cycle_id    INTEGER,
      status      TEXT NOT NULL DEFAULT 'open',
      answer      TEXT,
      answered_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);

    CREATE TABLE IF NOT EXISTS followups (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id     INTEGER,
      condition    TEXT NOT NULL,
      check_after  TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      resolution   TEXT,
      resolved_at  TEXT,
      triggered_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status, check_after);

    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      goals       TEXT,
      constraints TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_configs (
      source     TEXT PRIMARY KEY,
      secret     TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source       TEXT NOT NULL,
      event_type   TEXT,
      payload      TEXT,
      status       TEXT NOT NULL DEFAULT 'received',
      action       TEXT,
      error        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source, created_at);

    CREATE TABLE IF NOT EXISTS queued_topics (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      topic         TEXT NOT NULL,
      reason        TEXT,
      priority      TEXT NOT NULL DEFAULT 'medium',
      source        TEXT NOT NULL DEFAULT 'operator',
      project_id    INTEGER,
      scheduled_for TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queued_topics_status ON queued_topics(status);

    -- Dynamisch vom CEO erstellte Abteilungen (die 8 Kern-Agenten stehen fest im Code, siehe src/agents/index.js)
    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      created_by    TEXT,
      context       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Audit-Log für Unteragenten-Ergebnisse (Spawn-Mechanismus, siehe FEATURES.md #5)
    CREATE TABLE IF NOT EXISTS subagent_results (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id      TEXT NOT NULL,
      subagent_id    TEXT,
      subagent_name  TEXT,
      task           TEXT,
      result         TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function migrate(targetPath = dbPath()) {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const db = new Database(targetPath);
  applySchema(db);
  return db;
}

if (require.main === module) {
  const target = dbPath();
  const db = migrate(target);
  db.close();
  console.log(`[migrate] Schema angewendet: ${target}`);
}

module.exports = { migrate, applySchema, dbPath };
