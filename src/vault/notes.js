// src/vault/notes.js
// Sicherer Lese-/Schreibzugriff auf Vault-Notizen für den Assistenten.
// Regeln: nur .md, nur innerhalb VAULT_PATH, neue Notizen nur in Inbox/,
// bestehende Notizen werden nie überschrieben, nur ergänzt (mit Backup).

const fs      = require('fs');
const path    = require('path');
const indexer = require('./indexer');

const PREFIXES = ['Idee', 'Ref', 'Log'];
const INBOX = 'Inbox';

function safePath(relPath) {
  const root = path.resolve(indexer.vaultPath());
  const abs  = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Pfad liegt ausserhalb des Vaults');
  }
  if (!abs.toLowerCase().endsWith('.md')) throw new Error('Nur Markdown-Notizen (.md) erlaubt');
  const rel = path.relative(root, abs);
  if (rel.split(path.sep).some(p => p.startsWith('.'))) throw new Error('Versteckte Ordner sind gesperrt');
  return { root, abs, rel };
}

function cleanTitle(title) {
  return String(title)
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function today() { return new Date().toISOString().slice(0, 10); }

/**
 * Liest eine Notiz inkl. Text der verlinkten PDFs (aus dem Index-Cache).
 * @returns {{ path, text, total, offset, truncated }}
 */
function readNote(relPath, { includePdfs = true, offset = 0, maxChars = 12000 } = {}) {
  const { abs, rel } = safePath(relPath);
  if (!fs.existsSync(abs)) throw new Error(`Notiz nicht gefunden: ${rel}`);
  let text = fs.readFileSync(abs, 'utf8');

  if (includePdfs) {
    for (const pdf of indexer.noteMeta(rel)?.pdfs ?? []) {
      const pdfText = indexer.pdfText(pdf);
      if (pdfText) text += `\n\n=== PDF: ${pdf} ===\n${pdfText}`;
    }
  }

  const total = text.length;
  const slice = text.slice(offset, offset + maxChars);
  return { path: rel, text: slice, total, offset, truncated: offset + maxChars < total };
}

/**
 * Legt eine neue Notiz in Inbox/ an. Überschreibt nie.
 * @returns {string} relativer Pfad der neuen Notiz
 */
function createInboxNote({ prefix, title, body, tags = [] }) {
  if (!PREFIXES.includes(prefix)) throw new Error(`Präfix muss eines von ${PREFIXES.join(', ')} sein`);
  const t = cleanTitle(title);
  if (!t) throw new Error('Titel fehlt');

  const root = path.resolve(indexer.vaultPath());
  fs.mkdirSync(path.join(root, INBOX), { recursive: true });

  let name = `${prefix}: ${t}`;
  let n = 2;
  while (fs.existsSync(path.join(root, INBOX, `${name}.md`))) name = `${prefix}: ${t} ${n++}`;

  const fm = [
    '---',
    `created: ${today()}`,
    'source: assistant',
    tags.length ? `tags: [${tags.map(x => String(x).replace(/[,\]]/g, '')).join(', ')}]` : null,
    '---',
    '',
  ].filter(l => l !== null).join('\n');

  const rel = path.join(INBOX, `${name}.md`);
  safePath(rel);
  fs.writeFileSync(path.join(root, rel), `${fm}${String(body).trim()}\n`, { encoding: 'utf8', flag: 'wx' });
  return rel;
}

/**
 * Hängt Text unter eine Überschrift an (oder ans Dateiende, wenn es sie nicht gibt).
 * Vorher wird eine Kopie nach .assistant-backup/<datum>/ geschrieben.
 */
function appendToNote({ path: relPath, heading = null, text }) {
  const { root, abs, rel } = safePath(relPath);
  if (!fs.existsSync(abs)) throw new Error(`Notiz nicht gefunden: ${rel}`);
  if (!String(text ?? '').trim()) throw new Error('Text fehlt');

  const backupDir = path.join(root, '.assistant-backup', today(), path.dirname(rel));
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.copyFileSync(abs, path.join(backupDir, `${path.basename(rel, '.md')}-${stamp}.md`), fs.constants.COPYFILE_EXCL);

  const original = fs.readFileSync(abs, 'utf8');
  const addition = `${String(text).trim()}\n`;
  let updated;

  const h = heading ? String(heading).replace(/^#+\s*/, '').trim() : null;
  const lines = original.split('\n');
  const idx = h ? lines.findIndex(l => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, '').trim() === h) : -1;

  if (idx === -1) {
    const sep = original.endsWith('\n') ? '' : '\n';
    updated = h
      ? `${original}${sep}\n## ${h}\n\n${addition}`
      : `${original}${sep}\n${addition}`;
  } else {
    const level = lines[idx].match(/^#+/)[0].length;
    let end = lines.length;
    for (let i = idx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^(#+)\s/);
      if (m && m[1].length <= level) { end = i; break; }
    }
    // Leerzeilen am Abschnittsende überspringen, damit der Text direkt anschliesst
    let insertAt = end;
    while (insertAt > idx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    const before = lines.slice(0, insertAt).join('\n');
    const after  = lines.slice(insertAt).join('\n');
    updated = `${before}\n${addition.trimEnd()}${after ? '\n' + after : '\n'}`;
  }

  fs.writeFileSync(abs, updated, 'utf8');
  return rel;
}

module.exports = { readNote, createInboxNote, appendToNote, safePath, PREFIXES };
