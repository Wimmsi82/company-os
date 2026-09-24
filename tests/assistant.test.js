const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { makeVault } = require('./helpers');

let v, ix, history, assistant, calls;

function fakes() {
  calls = { llm: [], todoist: [], answered: [], deliberations: [] };
  return {
    llm: {
      chat: async (messages) => {
        calls.llm.push(messages);
        if (/FEHLER/.test(messages.at(-1).content)) throw new Error('Lokales Modell nicht erreichbar');
        return { text: 'Die Kündigungsfrist beträgt drei Monate [1].', tokens: 10, ms: 5 };
      },
    },
    todoist: {
      enabled: () => true,
      createTask: async (t) => { calls.todoist.push(t); return { id: '1', content: t.content, due: t.due, url: 'https://app.todoist.com/app/task/1' }; },
      filterTasks: async () => [{ id: '1', content: 'Steuer', due: 'heute' }],
    },
    company: {
      status: () => ({ open_escalations: 1, pending_tasks: 3, high_priority_tasks: 1, recent_cycles: [{ id: 7, status: 'done', topic: 'Preise' }] }),
      openEscalations: () => [{ id: 'abc12345-x', from: 'finance', question: 'Budget freigeben?', context: '' }],
      answerEscalation: (id, answer) => { calls.answered.push([id, answer]); return { from_dept: 'finance' }; },
      startDeliberation: (topic, cb) => { calls.deliberations.push(topic); cb(null, { cycleId: 9, decision: 'JA' }); },
      contextBlock: () => 'Offene Eskalationen: 1',
    },
  };
}

before(async () => {
  v = makeVault();
  ix = require('../src/vault/indexer');
  history = require('../src/assistant/history');
  await ix.syncIndex({ full: true });
  assistant = require('../src/assistant').createAssistant(fakes());
});
after(() => { ix.close(); history.close(); fs.rmSync(v.dir, { recursive: true, force: true }); });

const ask = (text, chatId = 'c1', notify) => assistant.handle({ channel: 'web', chatId, text, notify });

test('/suche listet Treffer mit obsidian-Link, /lies 1 liest inkl. PDF', async () => {
  const r = await ask('/suche Kündigungsfrist');
  assert.match(r.reply, /1\. Mietvertrag 📎1/);
  assert.match(r.reply, /obsidian:\/\/open\?vault=Vault&file=Projekte%2FVertraege%2FMietvertrag/);
  const l = await ask('/lies 1');
  assert.match(l.reply, /drei Monate/);
  const bad = await ask('/lies 5');
  assert.match(bad.reply, /Kein Treffer Nr\. 5/);
});

test('Freitext: Vault-Auszüge inkl. PDF-Text gehen ans Modell, Quellen hängen an', async () => {
  const r = await ask('Wie lange ist die Kündigungsfrist beim Mietvertrag?');
  const prompt = calls.llm.at(-1).at(-1).content;
  assert.match(prompt, /\[1\] Projekte\/Vertraege\/Mietvertrag\.md/);
  assert.match(prompt, /Quartalsende/);
  assert.doesNotMatch(prompt, /Company-OS-Status/);
  assert.match(r.reply, /drei Monate \[1\]/);
  assert.match(r.reply, /Quellen:\n\[1\] Mietvertrag – obsidian:/);
});

test('Freitext merkt sich den Verlauf, /neu setzt ihn zurück', async () => {
  await ask('Erste Frage zum Leasing', 'c2');
  await ask('Und die Laufzeit?', 'c2');
  const msgs = calls.llm.at(-1);
  assert.ok(msgs.some(m => m.role === 'user' && m.content === 'Erste Frage zum Leasing'));
  assert.ok(msgs.every(m => !/Quellen:/.test(m.content)));
  await ask('/neu', 'c2');
  await ask('Neue Frage', 'c2');
  assert.strictEqual(calls.llm.at(-1).length, 2); // nur System + aktuelle Frage
});

test('Company-Fragen bekommen den Company-OS-Status als Kontext', async () => {
  await ask('Welche Eskalation ist offen?');
  assert.match(calls.llm.at(-1).at(-1).content, /Company-OS-Status:\nOffene Eskalationen: 1/);
});

test('Modell nicht erreichbar → Fallback mit Vault-Treffern statt Absturz', async () => {
  const r = await ask('Mietvertrag FEHLER');
  assert.strictEqual(r.error, true);
  assert.match(r.reply, /Lokales Modell nicht erreichbar/);
  assert.match(r.reply, /Passende Notizen:\n1\. Mietvertrag/);
});

test('/aufgabe legt Todoist-Aufgabe mit Fälligkeit an', async () => {
  const r = await ask('/aufgabe Mietvertrag kündigen @ nächsten Montag');
  assert.deepStrictEqual(calls.todoist.at(-1), { content: 'Mietvertrag kündigen', due: 'nächsten Montag', labels: ['assistent'] });
  assert.match(r.reply, /✓ Todoist: Mietvertrag kündigen \(fällig: nächsten Montag\)/);
});

test('/notiz legt Inbox-Notiz an, /ergaenze hängt an', async () => {
  const r = await ask('/notiz idee: Bonsai Benchmark | Pi 5 messen');
  assert.match(r.reply, /✓ Notiz angelegt: Inbox\/Idee - Bonsai Benchmark\.md/);
  const e = await ask('/ergaenze Inbox/Idee - Bonsai Benchmark | Ergebnis | 4 Token/s');
  assert.match(e.reply, /✓ Ergänzt: .*unter „Ergebnis“/);
  assert.match(fs.readFileSync(`${v.vault}/Inbox/Idee - Bonsai Benchmark.md`, 'utf8'), /## Ergebnis\n\n4 Token\/s\n$/);
  assert.match((await ask('/notiz ohne Format')).reply, /Format:/);
  const d = await ask('/notiz Ref - Zweite Schreibweise | Text');
  assert.match(d.reply, /✓ Notiz angelegt: Inbox\/Ref - Zweite Schreibweise\.md/);
});

test('/heute, /status, /eskalationen, /antwort mit ID-Präfix', async () => {
  const h = await ask('/heute');
  assert.match(h.reply, /Todoist \(1\):\n- Steuer \(heute\)/);
  assert.match(h.reply, /\[abc12345\] finance: Budget freigeben\?/);
  assert.match((await ask('/status')).reply, /#7 done: Preise/);
  assert.match((await ask('/eskalationen')).reply, /\/antwort <ID>/);
  await ask('/antwort abc123 Ja, freigeben');
  assert.deepStrictEqual(calls.answered.at(-1), ['abc123', 'Ja, freigeben']);
});

test('/deliberation startet erst nach /ja und meldet das Ergebnis', async () => {
  const notes = [];
  await ask('/deliberation Seed-Runde verschieben?', 'c3');
  assert.strictEqual(calls.deliberations.length, 0);
  await ask('/nein', 'c3');
  assert.match((await ask('/ja', 'c3')).reply, /Nichts zu bestätigen/);
  await ask('/deliberation Seed-Runde verschieben?', 'c3');
  const r = await ask('/ja', 'c3', m => notes.push(m));
  assert.deepStrictEqual(calls.deliberations, ['Seed-Runde verschieben?']);
  assert.match(r.reply, /Ich melde mich/);
  assert.match(notes[0], /Deliberation #9 fertig/);
});

test('unbekannter Befehl und Fehler im Befehl werden abgefangen', async () => {
  assert.match((await ask('/foo')).reply, /Unbekannter Befehl \/foo/);
  assert.match((await ask('/lies ../../etc/passwd')).reply, /✗ Pfad liegt ausserhalb/);
});
