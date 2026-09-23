// src/assistant/index.js
// Persönlicher Assistent: Chat-Schnittstelle zu Vault, Todoist und Company OS.
//
// Prinzip: Befehle (/suche, /aufgabe, …) laufen deterministisch im Code —
// schnell und zuverlässig. Nur Freitext geht an das lokale Modell (Bonsai),
// und zwar mit den Vault-Treffern als Kontext (RAG). Das Modell muss also
// keine Tools aufrufen; das können kleine Modelle nicht zuverlässig.

const log = require('../utils/log');

const HELP = [
  'Befehle:',
  '/suche <Begriffe> – Vault durchsuchen (inkl. verlinkter PDFs)',
  '/lies <Nr. oder Pfad> – Notiz lesen (Nr. aus der letzten Suche)',
  '/notiz Idee|Ref|Log: <Titel> | <Text> – neue Notiz in Inbox/',
  '/ergaenze <Nr. oder Pfad> | <Überschrift> | <Text> – an Notiz anhängen',
  '/aufgabe <Text> @ <Fälligkeit> – Todoist-Aufgabe (z. B. "@ morgen 9 Uhr")',
  '/heute – Todoist heute + offene Eskalationen + neue Notizen',
  '/status – Company-OS-Status',
  '/eskalationen – offene Eskalationen',
  '/antwort <ID> <Text> – Eskalation beantworten',
  '/deliberation <Thema> – Deliberation vorschlagen (bestätigen mit /ja)',
  '/neu – Gesprächsverlauf zurücksetzen',
  'Alles andere: freie Frage an den Assistenten (sucht automatisch im Vault).',
].join('\n');

const SYSTEM_PROMPT = `Du bist der persönliche Assistent von Bernhard Wimmer (Salzburg).
Sprache: Deutsch, Du-Form, kurze präzise Sätze, aktive Stimme, kein Filler.
Sparring: Aussagen als Hypothesen behandeln, Risiken zuerst, klar sagen wenn etwas falsch ist.

Du bekommst Auszüge aus Bernhards Obsidian-Vault (Notizen und verlinkte PDFs, z. B. Verträge)
und ggf. den Status seines Multi-Agenten-Systems "Company OS".
Regeln:
- Antworte NUR auf Basis der Auszüge, wenn die Frage seine Unterlagen betrifft.
- Steht die Antwort nicht in den Auszügen, sag das klar. Erfinde keine Fristen, Beträge oder Namen.
- Nenne die Quelle mit [Nummer] (z. B. [1]).
- Schlage passende Befehle vor, wenn sinnvoll: /aufgabe für Fristen, /notiz zum Festhalten.`;

function createAssistant(deps = {}) {
  const llm     = deps.llm     ?? require('../llm/local');
  const todoist = deps.todoist ?? require('../integrations/todoist');
  const company = deps.company ?? require('./company');
  const indexer = deps.indexer ?? require('../vault/indexer');
  const notes   = deps.notes   ?? require('../vault/notes');
  const history = deps.history ?? require('./history');

  const CONTEXT_CHARS = parseInt(process.env.ASSISTANT_CONTEXT_CHARS ?? '6000');
  const lastResults = new Map();      // chatKey → [path]
  const pendingDeliberation = new Map(); // chatKey → topic

  // Das Modell auf dem Pi verträgt nur eine Anfrage gleichzeitig
  let queue = Promise.resolve();
  function serial(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  }

  function key(channel, chatId) { return `${channel}:${chatId}`; }

  function resolveRef(k, ref) {
    const r = String(ref ?? '').trim();
    if (/^\d+$/.test(r)) {
      const p = lastResults.get(k)?.[parseInt(r) - 1];
      if (!p) throw new Error(`Kein Treffer Nr. ${r} — erst /suche ausführen`);
      return p;
    }
    return r.toLowerCase().endsWith('.md') ? r : `${r}.md`;
  }

  function formatHits(hits) {
    return hits.map((h, i) => {
      const pdf = h.pdfs.length ? ` 📎${h.pdfs.length}` : '';
      return `${i + 1}. ${h.title}${pdf} (${h.folder || '/'}, ${h.modified})\n   ${h.snippet.replace(/\s+/g, ' ').slice(0, 220)}\n   ${indexer.obsidianLink(h.path)}`;
    }).join('\n');
  }

  // ── Befehle ───────────────────────────────────────────

  const commands = {
    async hilfe() { return { reply: HELP }; },

    async suche(arg, k) {
      if (!arg) return { reply: 'Was soll ich suchen? z. B. /suche Mietvertrag Kündigung' };
      const hits = indexer.search(arg, { limit: 8 });
      lastResults.set(k, hits.map(h => h.path));
      if (!hits.length) return { reply: `Nichts gefunden zu „${arg}“.` };
      return { reply: `${hits.length} Treffer:\n${formatHits(hits)}\n\nWeiter mit /lies <Nr.> oder direkt fragen.`, sources: hits.map(h => h.path) };
    },

    async lies(arg, k) {
      const [ref, off] = String(arg).split(/\s+ab\s+/);
      const p = resolveRef(k, ref);
      const note = notes.readNote(p, { offset: parseInt(off ?? '0') || 0, maxChars: 3500 });
      const more = note.truncated ? `\n\n… gekürzt (${note.offset + note.text.length}/${note.total} Zeichen). Weiter: /lies ${ref.trim()} ab ${note.offset + note.text.length}` : '';
      return { reply: `📄 ${note.path}\n${indexer.obsidianLink(note.path)}\n\n${note.text}${more}`, sources: [note.path] };
    },

    async notiz(arg) {
      const m = String(arg).match(/^(Idee|Ref|Log)\s*:\s*([^|]+?)\s*(?:\|\s*([\s\S]*))?$/i);
      if (!m) return { reply: 'Format: /notiz Idee|Ref|Log: Titel | Text' };
      const prefix = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      const rel = notes.createInboxNote({ prefix, title: m[2], body: m[3] ?? '' });
      indexer.syncIndex().catch(() => {});
      return { reply: `✓ Notiz angelegt: ${rel}\n${indexer.obsidianLink(rel)}`, sources: [rel] };
    },

    async ergaenze(arg, k) {
      const parts = String(arg).split('|').map(s => s.trim());
      if (parts.length < 2) return { reply: 'Format: /ergaenze <Nr. oder Pfad> | <Überschrift> | <Text>  (Überschrift optional)' };
      const p = resolveRef(k, parts[0]);
      const [heading, text] = parts.length >= 3 ? [parts[1], parts.slice(2).join(' | ')] : [null, parts[1]];
      const rel = notes.appendToNote({ path: p, heading, text });
      indexer.syncIndex().catch(() => {});
      return { reply: `✓ Ergänzt: ${rel}${heading ? ` (unter „${heading}“)` : ''}\nBackup liegt in .assistant-backup/.`, sources: [rel] };
    },

    async aufgabe(arg) {
      if (!todoist.enabled()) return { reply: 'Todoist ist nicht verbunden (TODOIST_API_TOKEN in .env fehlt).' };
      const [content, due] = String(arg).split(/\s+@\s+/);
      if (!content?.trim()) return { reply: 'Format: /aufgabe <Text> @ <Fälligkeit>' };
      const t = await todoist.createTask({ content: content.trim(), due: due?.trim() || null, labels: ['assistent'] });
      return { reply: `✓ Todoist: ${t.content}${t.due ? ` (fällig: ${t.due})` : ''}\n${t.url}` };
    },

    async heute() {
      const parts = [];
      if (todoist.enabled()) {
        try {
          const tasks = await todoist.filterTasks('today | overdue');
          parts.push(`📋 Todoist (${tasks.length}):\n` + (tasks.map(t => `- ${t.content}${t.due ? ` (${t.due})` : ''}`).join('\n') || '- nichts fällig'));
        } catch (err) { parts.push(`📋 Todoist nicht erreichbar: ${err.message}`); }
      }
      try {
        const esc = company.openEscalations();
        parts.push(`⚠️ Offene Eskalationen (${esc.length}):\n` + (esc.slice(0, 5).map(e => `- [${String(e.id).slice(0, 8)}] ${e.from}: ${e.question}`).join('\n') || '- keine'));
      } catch { parts.push('⚠️ Company OS nicht verfügbar.'); }
      const rec = indexer.recent({ days: 1, limit: 8 });
      parts.push(`🗂 Seit gestern geändert (${rec.length}):\n` + (rec.map(r => `- ${r.title} (${r.modified})`).join('\n') || '- nichts'));
      return { reply: parts.join('\n\n') };
    },

    async status() {
      const s = company.status();
      const cycles = s.recent_cycles.map(c => `- #${c.id} ${c.status}: ${c.topic}`).join('\n') || '- keine';
      return { reply: `Company OS\nEskalationen offen: ${s.open_escalations}\nTasks offen: ${s.pending_tasks} (hochprior: ${s.high_priority_tasks})\nLetzte Zyklen:\n${cycles}` };
    },

    async eskalationen() {
      const esc = company.openEscalations();
      if (!esc.length) return { reply: 'Keine offenen Eskalationen.' };
      return { reply: esc.map(e => `[${String(e.id).slice(0, 8)}] ${e.from}: ${e.question}${e.context ? `\n   ${String(e.context).slice(0, 200)}` : ''}`).join('\n\n') + '\n\nAntworten mit /antwort <ID> <Text>' };
    },

    async antwort(arg) {
      const m = String(arg).match(/^(\S+)\s+([\s\S]+)$/);
      if (!m) return { reply: 'Format: /antwort <ID> <Text>' };
      const esc = company.answerEscalation(m[1], m[2].trim());
      return { reply: `✓ Antwort an ${esc.from_dept} gesendet.` };
    },

    async deliberation(arg, k) {
      if (!arg) return { reply: 'Format: /deliberation <Thema>' };
      pendingDeliberation.set(k, arg);
      return { reply: `Deliberation zu „${arg}“ starten? Das sind 16+ Claude-Aufrufe über dein Abo und dauert einige Minuten.\nBestätigen mit /ja, abbrechen mit /nein.` };
    },

    async ja(_arg, k, ctx) {
      const topic = pendingDeliberation.get(k);
      if (!topic) return { reply: 'Nichts zu bestätigen.' };
      pendingDeliberation.delete(k);
      company.startDeliberation(topic, (err, r) => {
        if (!ctx.notify) return;
        if (err) ctx.notify(`✗ Deliberation fehlgeschlagen: ${err.message}`);
        else ctx.notify(`✓ Deliberation #${r.cycleId} fertig.\n\n${String(r.decision).slice(0, 1500)}`);
      });
      return { reply: `▶ Deliberation gestartet: „${topic}“. ${ctx.notify ? 'Ich melde mich, wenn sie fertig ist.' : 'Ergebnis im Dashboard unter Zyklen.'}` };
    },

    async nein(_arg, k) {
      pendingDeliberation.delete(k);
      return { reply: 'Abgebrochen.' };
    },

    async neu(_arg, k, ctx) {
      history.reset(ctx.channel, ctx.chatId);
      lastResults.delete(k);
      return { reply: 'Verlauf zurückgesetzt.' };
    },
  };
  const aliases = { help: 'hilfe', start: 'hilfe', search: 'suche', 'ergänze': 'ergaenze', today: 'heute', task: 'aufgabe' };

  // ── Freitext (RAG + lokales Modell) ──────────────────

  const COMPANY_HINT = /company|eskalation|deliberation|agent|abteilung|zyklus|\btasks?\b/i;

  function buildContext(question, k) {
    const hits = indexer.search(question, { limit: 5 });
    lastResults.set(k, hits.map(h => h.path));
    const blocks = [];
    let used = 0;
    hits.forEach((h, i) => {
      if (used >= CONTEXT_CHARS) return;
      let text = h.snippet;
      // Die zwei besten Treffer ausführlicher (inkl. PDF-Text)
      if (i < 2) {
        try { text = notes.readNote(h.path, { maxChars: Math.floor(CONTEXT_CHARS / 2.5) }).text; } catch {}
      }
      text = text.slice(0, CONTEXT_CHARS - used);
      used += text.length;
      blocks.push(`[${i + 1}] ${h.path}\n${text}`);
    });
    let companyCtx = '';
    if (COMPANY_HINT.test(question)) companyCtx = company.contextBlock();
    return { hits, blocks, companyCtx };
  }

  async function freeText(text, ctx) {
    const k = key(ctx.channel, ctx.chatId);
    const { hits, blocks, companyCtx } = buildContext(text, k);

    const contextMsg = [
      blocks.length ? `Auszüge aus dem Vault:\n\n${blocks.join('\n\n---\n\n')}` : 'Keine passenden Vault-Auszüge gefunden.',
      companyCtx ? `\nCompany-OS-Status:\n${companyCtx}` : '',
    ].join('\n');

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nHeute ist ${new Date().toLocaleDateString('de-AT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.` },
      ...history.recent(ctx.channel, ctx.chatId, 6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: `${contextMsg}\n\n---\nFrage: ${text}` },
    ];

    const sourcesList = hits.length
      ? '\n\nQuellen:\n' + hits.map((h, i) => `[${i + 1}] ${h.title} – ${indexer.obsidianLink(h.path)}`).join('\n')
      : '';

    try {
      const { text: answer, ms } = await serial(() => llm.chat(messages));
      log.info(`[Assistent] Antwort in ${Math.round(ms / 1000)}s (${hits.length} Vault-Treffer)`);
      return { reply: `${answer || '(leere Antwort vom Modell)'}${sourcesList}`, sources: hits.map(h => h.path) };
    } catch (err) {
      log.error(`[Assistent] LLM-Fehler: ${err.message}`);
      const fallback = hits.length ? `Passende Notizen:\n${formatHits(hits)}` : 'Im Vault habe ich nichts Passendes gefunden.';
      return { reply: `⚠️ ${err.message}\n\n${fallback}`, sources: hits.map(h => h.path), error: true };
    }
  }

  // ── Einstieg ─────────────────────────────────────────

  /**
   * @param {{ channel:'web'|'telegram', chatId:string|number, text:string, notify?:(msg:string)=>void }} input
   * @returns {Promise<{ reply:string, sources?:string[], error?:boolean }>}
   */
  async function handle({ channel, chatId, text, notify = null }) {
    const input = String(text ?? '').trim();
    if (!input) return { reply: HELP };
    const ctx = { channel, chatId: String(chatId), notify };
    const k = key(channel, chatId);

    let result;
    const cmd = input.match(/^\/([\p{L}]+)(?:@\w+)?\s*([\s\S]*)$/u);
    try {
      if (cmd) {
        const name = aliases[cmd[1].toLowerCase()] ?? cmd[1].toLowerCase();
        const fn = commands[name];
        result = fn ? await fn(cmd[2].trim(), k, ctx) : { reply: `Unbekannter Befehl /${cmd[1]}.\n\n${HELP}` };
      } else {
        result = await freeText(input, ctx);
      }
    } catch (err) {
      log.error(`[Assistent] ${err.message}`);
      result = { reply: `✗ ${err.message}`, error: true };
    }

    // Nur Freitext-Dialoge in den LLM-Verlauf, Befehle nicht (halten den Kontext klein)
    if (!cmd && !result.error) {
      try {
        history.add(channel, chatId, 'user', input);
        history.add(channel, chatId, 'assistant', result.reply.replace(/\n\nQuellen:[\s\S]*$/, ''));
      } catch (err) { log.warn(`[Assistent] Verlauf nicht gespeichert: ${err.message}`); }
    }
    return result;
  }

  return { handle, HELP };
}

let _default = null;
function handle(input) {
  if (!_default) _default = createAssistant();
  return _default.handle(input);
}

module.exports = { createAssistant, handle, HELP };
