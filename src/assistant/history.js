// src/assistant/history.js
// Gesprächsverlauf des Assistenten, pro Kanal (web/telegram) und Chat-ID.

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

let _db = null;
let _file = null;

function getDb() {
  const file = process.env.ASSISTANT_DB || path.join(__dirname, '../../db/assistant.sqlite');
  if (_db && _file === file) return _db;
  if (_db) _db.close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new Database(file);
  _file = file;
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY,
      channel    TEXT NOT NULL,
      chat_id    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat ON chat_messages(channel, chat_id, id);
    CREATE TABLE IF NOT EXISTS chat_resets (
      channel TEXT NOT NULL, chat_id TEXT NOT NULL, reset_id INTEGER NOT NULL,
      PRIMARY KEY (channel, chat_id)
    );
  `);
  return _db;
}

function add(channel, chatId, role, content) {
  getDb().prepare('INSERT INTO chat_messages (channel, chat_id, role, content) VALUES (?, ?, ?, ?)')
    .run(channel, String(chatId), role, content);
}

/** Letzte n Nachrichten seit dem letzten /neu, chronologisch. */
function recent(channel, chatId, n = 6) {
  const d = getDb();
  const reset = d.prepare('SELECT reset_id FROM chat_resets WHERE channel = ? AND chat_id = ?')
    .get(channel, String(chatId))?.reset_id ?? 0;
  return d.prepare(`SELECT role, content, created_at FROM chat_messages
    WHERE channel = ? AND chat_id = ? AND id > ? ORDER BY id DESC LIMIT ?`)
    .all(channel, String(chatId), reset, n).reverse();
}

/** Verlauf für den Kontext kappen, ohne Nachrichten zu löschen. */
function reset(channel, chatId) {
  const d = getDb();
  const last = d.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages').get().id;
  d.prepare(`INSERT INTO chat_resets (channel, chat_id, reset_id) VALUES (?, ?, ?)
    ON CONFLICT(channel, chat_id) DO UPDATE SET reset_id = excluded.reset_id`)
    .run(channel, String(chatId), last);
}

function close() { if (_db) { _db.close(); _db = null; _file = null; } }

module.exports = { add, recent, reset, close };
