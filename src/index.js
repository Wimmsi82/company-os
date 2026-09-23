// src/index.js
// Einstiegspunkt — startet API-Server und autonomen Scheduler

require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./api/routes');
const cron = require('./scheduler/cron');
const log = require('./utils/log');

const PORT = process.env.PORT ?? 3000;

// ── Checks ──────────────────────────────────────────────

// Nur der API-Modus braucht einen Key; im CLI-Modus läuft alles über das Claude-Abo
if ((process.env.CLAUDE_MODE ?? 'cli') === 'api' && !process.env.ANTHROPIC_API_KEY) {
  log.error('ANTHROPIC_API_KEY fehlt — bitte .env anlegen oder CLAUDE_MODE=cli setzen');
  process.exit(1);
}

// ── Express ─────────────────────────────────────────────

const app = express();
app.use(express.json());

// Statisches Frontend
app.use(express.static(path.join(__dirname, 'ui')));

// API-Routes
app.use('/api', routes);

// Fallback → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

app.listen(PORT, () => {
  log.info(`[Server] Company OS läuft auf http://localhost:${PORT}`);
});

// ── Autonomer Scheduler ──────────────────────────────────

cron.start();

// ── Assistent: Vault-Index + Telegram-Chat ───────────────

require('./vault/indexer').syncIndex()
  .catch(err => log.error('[Vault-Index] Erststart fehlgeschlagen: ' + err.message));
require('./notifications/telegram-bot').start();

// ── Graceful Shutdown ────────────────────────────────────

process.on('SIGTERM', () => {
  log.info('[Server] SIGTERM — fahre herunter …');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  log.error('[Server] Unhandled Rejection: ' + err.message);
});
