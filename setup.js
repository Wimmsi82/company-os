#!/usr/bin/env node
// setup.js — Ersteinrichtung Company OS
// Aufruf: node setup.js

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const SEP  = '─'.repeat(60);
const SEP2 = '━'.repeat(60);

async function main() {
  console.log('\n' + SEP2);
  console.log('  COMPANY OS — Setup');
  console.log(SEP2 + '\n');
  console.log('Willkommen. Dieses Script richtet Company OS ein.\n');

  // ── MODUS WÄHLEN ──────────────────────────────────────

  console.log('Wie soll Company OS Claude aufrufen?\n');
  console.log('  [1]  Claude Code CLI  — kein API Key nötig');
  console.log('       Voraussetzung: Claude Code ist installiert');
  console.log('       Kosten: kostenlos im Max-Plan\n');
  console.log('  [2]  Anthropic API    — eigener API Key');
  console.log('       Voraussetzung: API Key auf console.anthropic.com');
  console.log('       Kosten: ~$0.01–0.10 pro Deliberation\n');

  let modeChoice = '';
  while (!['1', '2'].includes(modeChoice)) {
    modeChoice = (await ask('  Deine Wahl [1 oder 2]: ')).trim();
  }

  const mode = modeChoice === '1' ? 'cli' : 'api';
  let apiKey = '';
  let dailyLimit = '100000';

  if (mode === 'cli') {
    console.log('\n✓ Modus: Claude Code CLI\n');

    // Prüfen ob claude verfügbar ist
    try {
      execSync('which claude', { stdio: 'pipe' });
      console.log('✓ Claude Code gefunden.\n');
    } catch {
      console.log('⚠ Claude Code nicht gefunden.');
      console.log('  Installieren: https://claude.ai/code\n');
    }

  } else {
    console.log('\n✓ Modus: Anthropic API\n');

    // API Key eingeben
    console.log('API Key eingeben (console.anthropic.com → API Keys):');
    while (!apiKey.startsWith('sk-')) {
      apiKey = (await ask('  sk-ant-...: ')).trim();
      if (!apiKey.startsWith('sk-')) console.log('  ⚠ Ungültig — muss mit sk- beginnen.');
    }
    console.log('✓ API Key gesetzt.\n');

    // Token-Limit
    console.log('Tägliches Token-Limit (schützt vor hohen Kosten):');
    console.log('  100000 = ~$1.50 max/Tag  (empfohlen)');
    console.log('  50000  = ~$0.75 max/Tag');
    console.log('  200000 = ~$3.00 max/Tag\n');
    const limitInput = (await ask('  Limit [Enter = 100000]: ')).trim();
    if (limitInput && !isNaN(limitInput)) dailyLimit = limitInput;
    console.log(`✓ Limit: ${parseInt(dailyLimit).toLocaleString()} Tokens/Tag\n`);
  }

  // ── PORT ──────────────────────────────────────────────

  const portInput = (await ask('Server-Port [Enter = 3000]: ')).trim();
  const port = portInput && !isNaN(portInput) ? portInput : '3000';

  // ── INTERVAL ─────────────────────────────────────────

  console.log('\nWie oft soll die Task-Queue automatisch laufen?');
  const intervalInput = (await ask('Interval in Minuten [Enter = 60]: ')).trim();
  const interval = intervalInput && !isNaN(intervalInput) ? intervalInput : '60';

  // ── .env SCHREIBEN ────────────────────────────────────

  const envContent = `# Company OS — Konfiguration
# Generiert von setup.js am ${new Date().toLocaleDateString('de-AT')}

# Modus: 'cli' = Claude Code (kein API Key), 'api' = Anthropic API
CLAUDE_MODE=${mode}

# API Key (nur für CLAUDE_MODE=api)
ANTHROPIC_API_KEY=${apiKey}
CLAUDE_MODEL=claude-sonnet-4-20250514

# Server
PORT=${port}

# Autonomer Betrieb
CYCLE_INTERVAL_MINUTES=${interval}
MAX_AGENT_CALLS_PER_CYCLE=20

# Token-Budget (nur für CLAUDE_MODE=api)
DAILY_TOKEN_LIMIT=${dailyLimit}

# Logging: debug | info | warn | error
LOG_LEVEL=info
`;

  fs.writeFileSync(path.join(__dirname, '.env'), envContent, 'utf8');
  console.log('\n✓ .env erstellt\n');

  // ── DATENBANK ────────────────────────────────────────

  console.log('Datenbank initialisieren …');
  try {
    execSync('node src/db/migrate.js', { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    console.error('Fehler bei Migration:', err.message);
  }

  // ── ZUSAMMENFASSUNG ───────────────────────────────────

  console.log('\n' + SEP2);
  console.log('  Setup abgeschlossen.\n');
  console.log(`  Modus:    ${mode === 'cli' ? 'Claude Code CLI' : 'Anthropic API'}`);
  console.log(`  Port:     ${port}`);
  console.log(`  Interval: alle ${interval} Minuten`);
  if (mode === 'api') console.log(`  Limit:    ${parseInt(dailyLimit).toLocaleString()} Tokens/Tag`);
  console.log('\n' + SEP2);
  console.log('\nNächste Schritte:\n');
  console.log('  1. Onboarding (Unternehmenskontext eingeben):');
  console.log('     node run.js --onboarding\n');
  console.log('  2. Erste Deliberation starten:');
  console.log('     node run.js "Deine erste Frage"\n');
  if (mode === 'api') {
    console.log('  3. Server starten (Dashboard + autonomer Betrieb):');
    console.log('     npm start\n');
    console.log(`     Dashboard: http://localhost:${port}\n`);
  }

  rl.close();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
