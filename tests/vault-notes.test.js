const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs   = require('fs');
const path = require('path');
const { makeVault } = require('./helpers');

let v, ix, notes;

before(async () => {
  v = makeVault();
  ix = require('../src/vault/indexer');
  notes = require('../src/vault/notes');
  await ix.syncIndex({ full: true });
});
after(() => { ix.close(); fs.rmSync(v.dir, { recursive: true, force: true }); });

test('Path-Traversal und Nicht-Markdown werden abgelehnt', () => {
  assert.throws(() => notes.readNote('../../etc/passwd.md'), /ausserhalb/);
  assert.throws(() => notes.readNote('/etc/hosts'), /ausserhalb|Markdown/);
  assert.throws(() => notes.readNote('Anhaenge/Mietvertrag Wohnung.pdf'), /Markdown/);
  assert.throws(() => notes.readNote('.obsidian/x.md'), /Versteckte/);
  assert.throws(() => notes.appendToNote({ path: '../x.md', text: 'a' }), /ausserhalb/);
});

test('readNote hängt den PDF-Text an und blättert mit offset', () => {
  const r = notes.readNote('Projekte/Vertraege/Mietvertrag.md');
  assert.match(r.text, /=== PDF: Anhaenge\/Mietvertrag Wohnung\.pdf ===/);
  assert.match(r.text, /drei Monate/);
  const part = notes.readNote('Projekte/Vertraege/Mietvertrag.md', { maxChars: 20 });
  assert.strictEqual(part.truncated, true);
  const next = notes.readNote('Projekte/Vertraege/Mietvertrag.md', { offset: 20, maxChars: 20 });
  assert.strictEqual(next.offset, 20);
});

test('createInboxNote: nur Inbox, Präfix Pflicht, überschreibt nie', () => {
  const a = notes.createInboxNote({ prefix: 'Idee', title: 'Bonsai / Pi: Test', body: 'Text', tags: ['ki'] });
  assert.strictEqual(a, path.join('Inbox', 'Idee - Bonsai Pi Test.md'));
  const b = notes.createInboxNote({ prefix: 'Idee', title: 'Bonsai / Pi: Test', body: 'Zweiter' });
  assert.strictEqual(b, path.join('Inbox', 'Idee - Bonsai Pi Test 2.md'));
  const content = fs.readFileSync(path.join(v.vault, a), 'utf8');
  assert.match(content, /^---\ncreated: \d{4}-\d{2}-\d{2}\nsource: assistant\ntags: \[ki\]\n---\nText\n$/);
  assert.throws(() => notes.createInboxNote({ prefix: 'Todo', title: 'x', body: '' }), /Präfix/);
});

test('appendToNote: unter Überschrift, am Ende, mit Backup', () => {
  v.write('Projekte/local-ai-setup.md', '# Local AI\n\n## Modelle\n\n- qwen\n\n## Hardware\n\nMac M5\n');
  notes.appendToNote({ path: 'Projekte/local-ai-setup.md', heading: 'Modelle', text: '- Bonsai 2 27B' });
  notes.appendToNote({ path: 'Projekte/local-ai-setup.md', heading: 'Pi', text: 'Pi 5 16 GB' });
  const out = fs.readFileSync(path.join(v.vault, 'Projekte/local-ai-setup.md'), 'utf8');
  assert.strictEqual(out, '# Local AI\n\n## Modelle\n\n- qwen\n- Bonsai 2 27B\n\n## Hardware\n\nMac M5\n\n## Pi\n\nPi 5 16 GB\n');
  const backups = fs.readdirSync(path.join(v.vault, '.assistant-backup'), { recursive: true }).filter(f => f.endsWith('.md'));
  assert.strictEqual(backups.length, 2);
});
