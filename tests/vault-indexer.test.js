const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs   = require('fs');
const path = require('path');
const { makeVault } = require('./helpers');

let v, ix;

before(async () => {
  v = makeVault();
  ix = require('../src/vault/indexer');
  await ix.syncIndex({ full: true });
});
after(() => { ix.close(); fs.rmSync(v.dir, { recursive: true, force: true }); });

test('parseNote: Frontmatter-Tags, Inline-Tags, Wikilinks, PDF-Links', () => {
  const p = ix.parseNote('---\ntags:\n  - vertrag\n  - wohnen\n---\n# Titel\n#privat [[Andere Notiz|Alias]] ![[a b.pdf]] [x](Ordner/c%20d.pdf) `#kein-tag`\n');
  assert.deepStrictEqual(p.tags.sort(), ['privat', 'vertrag', 'wohnen']);
  assert.deepStrictEqual(p.links, ['Andere Notiz']);
  assert.deepStrictEqual(p.pdfs, ['a b.pdf', 'Ordner/c d.pdf']);
  assert.strictEqual(p.h1, 'Titel');
});

test('findet Vertrag über den Text des verlinkten PDFs (Wikilink im Anhang-Ordner)', () => {
  const hits = ix.search('Quartalsende');
  assert.strictEqual(hits[0]?.path, 'Projekte/Vertraege/Mietvertrag.md');
  assert.deepStrictEqual(hits[0].pdfs, ['Anhaenge/Mietvertrag Wohnung.pdf']);
  assert.match(hits[0].snippet, /^\[PDF\]/);
});

test('findet PDF über relativen, URL-kodierten Markdown-Link', () => {
  assert.strictEqual(ix.search('Leasingrate')[0]?.path, 'Projekte/Vertraege/Leasing.md');
});

test('Umlaute: "Kündigungsfrist" findet "Kuendigungsfrist" und umgekehrt', () => {
  assert.ok(ix.search('Kündigungsfrist').some(h => h.path.endsWith('Mietvertrag.md')));
  assert.ok(ix.search('Kuendigung').some(h => h.path.endsWith('Seed-Runde.md')));
});

test('Nutzereingabe mit FTS-Syntax wirft keinen Fehler', () => {
  assert.doesNotThrow(() => ix.search('"(* OR NEAR AND'));
  assert.deepStrictEqual(ix.search('!!'), []);
});

test('.trash und .obsidian werden nicht indexiert', () => {
  assert.ok(ix.search('geheim').every(h => !h.path.startsWith('.trash')));
});

test('Filter nach Ordner und Tag', () => {
  assert.strictEqual(ix.search('Mietvertrag', { folder: 'Projekte/Berthos' }).length, 0);
  assert.strictEqual(ix.search('Mietvertrag', { tag: 'vertrag' }).length, 1);
});

test('inkrementell: Änderung, neue Datei und Löschung', async () => {
  const later = new Date(Date.now() + 5000);
  v.write('Projekte/Berthos/Seed-Runde.md', '# Seed-Runde\n\nLead-Investor ist Speedinvest.\n');
  fs.utimesSync(path.join(v.vault, 'Projekte/Berthos/Seed-Runde.md'), later, later);
  v.write('Inbox/Ref - Neu.md', 'Zollstock');
  fs.rmSync(path.join(v.vault, 'Inbox/Idee - Bonsai am Pi.md'));

  const s = await ix.syncIndex();
  assert.deepStrictEqual([s.added, s.updated, s.removed], [1, 1, 1]);
  assert.strictEqual(ix.search('Speedinvest').length, 1);
  assert.strictEqual(ix.search('Zollstock').length, 1);
  assert.strictEqual(ix.search('Bonsai').length, 0);

  const again = await ix.syncIndex();
  assert.deepStrictEqual([again.added, again.updated, again.removed], [0, 0, 0]);
});

test('obsidianLink kodiert Vault und Pfad', () => {
  assert.strictEqual(ix.obsidianLink('Inbox/Idee: A B.md'), 'obsidian://open?vault=Vault&file=Inbox%2FIdee%3A%20A%20B');
});
