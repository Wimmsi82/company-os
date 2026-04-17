// src/api/claude.js
// Zentraler Claude-Wrapper — unterstuetzt CLI-Modus und API-Modus
// Modus wird via CLAUDE_MODE in .env gesteuert: 'cli' oder 'api'

const path = require('path');
const fs = require('fs');
const os = require('os');

const MODE = process.env.CLAUDE_MODE ?? 'cli';

let totalTokensUsed = 0;

function getDb() { return require('../db'); }

// ── CLI-MODUS (Claude Code, kein API Key) ──────────────

function callViaCLI(system, userMessage) {
  const { execSync } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), `cos-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const content = `${system}\n\n---\n\n${userMessage}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  try {
    const result = execSync(
      `claude -p "$(cat ${tmpFile})" --output-format text 2>/dev/null`,
      { encoding: 'utf8', timeout: 120000, shell: '/bin/bash' }
    );
    return { text: result.trim() || 'Keine Antwort.', tokens: 0 };
  } catch (err) {
    const out = err.stdout?.trim();
    return { text: out || `Fehler: ${err.message.slice(0, 100)}`, tokens: 0 };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ── API-MODUS (Anthropic API Key) ──────────────────────

let _anthropicClient = null;
function getClient() {
  if (!_anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

function estimateCost(input, output) {
  return (input * 0.000003) + (output * 0.000015);
}

function checkBudget() {
  if (MODE !== 'api') return;
  const db = getDb();
  const budget = db.getTodayBudget();
  const limit = parseInt(process.env.DAILY_TOKEN_LIMIT ?? '100000');
  if (budget.tokens_used >= limit) {
    throw new Error(`Token-Budget erschoepft: ${budget.tokens_used}/${limit}. Kein API-Call bis Mitternacht.`);
  }
  if (!budget.alert_sent && budget.tokens_used >= limit * 0.8) {
    const log = require('../utils/log');
    log.warn(`[Budget] 80% erreicht: ${budget.tokens_used}/${limit}`);
    db.setBudgetAlertSent();
    db.createEscalation({
      from_dept: 'system',
      question: `Token-Budget bei ${Math.round(budget.tokens_used / limit * 100)}%`,
      context: `Tageskosten: ~$${budget.cost_usd.toFixed(4)}. Limit via DAILY_TOKEN_LIMIT in .env.`,
    });
  }
}

async function callViaAPI(system, messages, opts = {}) {
  checkBudget();
  const model = opts.model ?? 'claude-sonnet-4-20250514';
  const max_tokens = opts.max_tokens ?? 1024;
  const msgArray = Array.isArray(messages)
    ? messages
    : [{ role: 'user', content: messages }];

  const res = await getClient().messages.create({ model, max_tokens, system, messages: msgArray });
  const text = res.content?.[0]?.text ?? '';
  const inputTok = res.usage?.input_tokens ?? 0;
  const outputTok = res.usage?.output_tokens ?? 0;
  const tokens = inputTok + outputTok;
  totalTokensUsed += tokens;

  if (MODE === 'api') {
    getDb().trackTokens(tokens, estimateCost(inputTok, outputTok));
  }
  return { text, tokens };
}

// ── PUBLIC API ─────────────────────────────────────────

async function call(system, messages, opts = {}) {
  if (MODE === 'cli') {
    const userMsg = Array.isArray(messages) ? messages.map(m => m.content).join('\n') : messages;
    return callViaCLI(system, userMsg);
  }
  return callViaAPI(system, messages, opts);
}

async function multiTurn(system, turns) {
  const messages = [];
  let totalTokens = 0;
  for (const turn of turns) {
    messages.push({ role: 'user', content: turn });
    const { text, tokens } = await call(system, messages);
    messages.push({ role: 'assistant', content: text });
    totalTokens += tokens;
  }
  return { messages, totalTokens };
}

function getMode() { return MODE; }
function getTokensUsed() { return totalTokensUsed; }

module.exports = { call, multiTurn, getMode, getTokensUsed };
