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

if (!process.env.ANTHROPIC_API_KEY) {
  log.error('ANTHROPIC_API_KEY fehlt — bitte .env anlegen');
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

// ── Graceful Shutdown ────────────────────────────────────

process.on('SIGTERM', () => {
  log.info('[Server] SIGTERM — fahre herunter …');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  log.error('[Server] Unhandled Rejection: ' + err.message);
});
