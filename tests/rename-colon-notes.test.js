const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newBaseName, plan, apply, undo } = require('../scripts/rename-colon-notes');

function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-rename-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w('.obsidian/app.json', '{}');
  w('Inbox/Ref: Jevbridge Check 2026-09-22.md', '# Jevbridge\n');
  w('Inbox/Idee: Wochenvorschlaege.md', 'Siehe [[Ref: Jevbridge Check 2026-09-22]].\n');
  w('Inbox/Log: Build 2026-09-14 12:30.md', 'Log\n');
  w('Projekte/Übersicht.md', [
    '- [[Ref: Jevbridge Check 2026-09-22|Jevbridge]]',
    '- [[Inbox/Idee: Wochenvorschlaege#Plan]]',
    '- ![[Log: Build 2026-09-14 12:30.md]]',
    '- [md](Inbox/Ref%3A%20Jevbridge%20Check%202026-09-22.md)',
    '- [[Ref: gibt es nicht]] und https://example.com/a:b',
    '',
  ].join('\n'));
  w('Projekte/Board.canvas', JSON.stringify({ nodes: [{ type: 'file', file: 'Inbox/Idee: Wochenvorschlaege.md' }] }));
  w('Inbox/Idee: Doppelt.md', 'alt');
  w('Inbox/Idee - Doppelt.md', 'schon da');
  w('.magma/history/Ref: versteckt.md', 'bleibt');
  w('node_modules/x/Ref: modul.md', 'bleibt');
  return root;
}

function snapshot(root) {
  const out = {};
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) stack.push(r); else out[r] = fs.readFileSync(path.join(root, r), 'utf8');
    }
  }
  return out;
}

test('newBaseName: Präfix mit Bindestrich, übrige Doppelpunkte entfernt', () => {
  assert.strictEqual(newBaseName('Ref: Harvard Business Review 2026-05-13.md'), 'Ref - Harvard Business Review 2026-05-13.md');
  assert.strictEqual(newBaseName('Log: Pakete 12 bis 17 CI und Build 2026-09-14 2246.md'), 'Log - Pakete 12 bis 17 CI und Build 2026-09-14 2246.md');
  assert.strictEqual(newBaseName('Idee:Ohne Leerzeichen.md'), 'Idee - Ohne Leerzeichen.md');
  assert.strictEqual(newBaseName('Meeting: Kunde: Nachfass 12:30.md'), 'Meeting - Kunde - Nachfass 12-30.md');
});

test('Probelauf ändert nichts, meldet Konflikte, lässt versteckte Ordner und node_modules aus', () => {
  const root = makeVault();
  const before = snapshot(root);
  const p = plan(root);
  assert.deepStrictEqual(snapshot(root), before);
  assert.deepStrictEqual(p.renames.map(r => r.from).sort(), [
    'Inbox/Idee: Wochenvorschlaege.md', 'Inbox/Log: Build 2026-09-14 12:30.md', 'Inbox/Ref: Jevbridge Check 2026-09-22.md',
  ]);
  assert.deepStrictEqual(p.skipped.map(s => s.from), ['Inbox/Idee: Doppelt.md']);
});

test('--apply benennt um, passt alle Linkformen an, Undo stellt alles wieder her', () => {
  const root = makeVault();
  const before = snapshot(root);
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-rename-bak-'));
  apply(root, plan(root), backupRoot);
  const after = snapshot(root);

  const renamed = Object.keys(after).filter(f => f.startsWith('Inbox/') && f.includes(':'));
  assert.deepStrictEqual(renamed, ['Inbox/Idee: Doppelt.md']);
  assert.ok(after['Inbox/Ref - Jevbridge Check 2026-09-22.md']);
  assert.ok(after['Inbox/Log - Build 2026-09-14 12-30.md']);
  assert.strictEqual(after['Inbox/Idee - Doppelt.md'], 'schon da');
  assert.strictEqual(after['Inbox/Idee - Wochenvorschlaege.md'], 'Siehe [[Ref - Jevbridge Check 2026-09-22]].\n');

  const ov = after['Projekte/Übersicht.md'];
  assert.match(ov, /\[\[Ref - Jevbridge Check 2026-09-22\|Jevbridge\]\]/);
  assert.match(ov, /\[\[Inbox\/Idee - Wochenvorschlaege#Plan\]\]/);
  assert.match(ov, /!\[\[Log - Build 2026-09-14 12-30\.md\]\]/);
  assert.match(ov, /\[md\]\(Inbox\/Ref%20-%20Jevbridge%20Check%202026-09-22\.md\)/);
  assert.match(ov, /\[\[Ref: gibt es nicht\]\] und https:\/\/example\.com\/a:b/);
  assert.match(after['Projekte/Board.canvas'], /"Inbox\/Idee - Wochenvorschlaege\.md"/);
  assert.strictEqual(after['.magma/history/Ref: versteckt.md'], 'bleibt');
  assert.strictEqual(after['node_modules/x/Ref: modul.md'], 'bleibt');

  undo(path.join(backupRoot, 'manifest.json'));
  assert.deepStrictEqual(snapshot(root), before);
});
