const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-cyclelog-'));
process.env.VAULT_PATH = vault;
const { writeCycleLog, writeAlertToInbox, readVaultContext } = require('../src/vault/index');
const { searchCycleHistory } = require('../src/vault/search');
const projectDir = path.join(vault, 'Projekte', 'company-os');

test('Cycle-Log und Alert heissen "Log - …", ohne Doppelpunkt im Dateinamen', () => {
  writeCycleLog({ cycleId: 7, topic: 'Preismodell: SaaS oder Lizenz?', phase1: { finance: 'x' }, decision: 'Wir starten mit SaaS.' });
  writeAlertToInbox('churn', 9, 5, 'sales');
  const files = [...fs.readdirSync(projectDir), ...fs.readdirSync(path.join(vault, 'Inbox'))];
  assert.ok(files.some(f => f.startsWith('Log - company-os Zyklus 7 - Preismodell- SaaS oder Lizenz- ')), files.join(' | '));
  assert.ok(files.some(f => f.startsWith('Log - Metrik-Alert churn ')), files.join(' | '));
  assert.ok(files.every(f => !f.includes(':')), files.join(' | '));
});

test('searchCycleHistory findet neue und alte Schreibweise, Kontext ignoriert beide', () => {
  fs.writeFileSync(path.join(projectDir, 'Log: company-os Zyklus 3 - Preismodell alt 2026-01-01.md'),
    '# Preismodell\n\n## CEO-Synthese\nAlte Entscheidung zum Preismodell.\n');
  fs.writeFileSync(path.join(projectDir, 'Kontext Preismodell.md'), 'Kontext zum Preismodell.');

  const hits = searchCycleHistory('Preismodell SaaS Lizenz', 5);
  assert.match(hits, /Wir starten mit SaaS\./);
  assert.match(hits, /Alte Entscheidung zum Preismodell\./);
  assert.doesNotMatch(hits, /Log[:-]/);

  const ctx = readVaultContext('Preismodell');
  assert.match(ctx, /Kontext zum Preismodell/);
  assert.doesNotMatch(ctx, /CEO-Synthese|Zyklus/);
});
