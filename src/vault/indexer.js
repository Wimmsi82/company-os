// src/vault/indexer.js
// Volltext-Index über den gesamten Obsidian-Vault (SQLite FTS5)
// Markdown-Notizen + Text der darin verlinkten PDFs. Eigene DB-Datei,
// damit der Index jederzeit gelöscht und neu aufgebaut werden kann.

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');
const log      = require('../utils/log');

const SKIP_DIRS      = new Set(['.obsidian', '.trash', '.assistant-backup', '.git', 'node_modules']);
const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_PDF_CHARS  = 200000;

function vaultPath() {
  return process.env.VAULT_PATH || path.join(
    process.env.HOME ?? '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault'
  );
}

// ── DB ─────────────────────────────────────────────────

let _db = null;
let _dbFile = null;

function getDb() {
  const file = process.env.VAULT_INDEX_DB
    || path.join(__dirname, '../../db/vault-index.sqlite');
  if (_db && _dbFile === file) return _db;
  if (_db) _db.close();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new Database(file);
  _dbFile = file;
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id          INTEGER PRIMARY KEY,
      path        TEXT UNIQUE NOT NULL,
      title       TEXT,
      folder      TEXT,
      tags        TEXT,
      frontmatter TEXT,
      links       TEXT,
      pdfs        TEXT,
      mtime       INTEGER,
      size        INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title, tags, body, pdf_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS pdf_cache (
      pdf_path TEXT PRIMARY KEY,
      mtime    INTEGER,
      text     TEXT,
      pages    INTEGER
    );
  `);
  return _db;
}

function close() {
  if (_db) { _db.close(); _db = null; _dbFile = null; }
}

// ── PARSING ────────────────────────────────────────────

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      lastKey = kv[1];
      let val = kv[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      data[lastKey] = val === '' ? [] : val;
      continue;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && lastKey) {
      if (!Array.isArray(data[lastKey])) data[lastKey] = data[lastKey] ? [data[lastKey]] : [];
      data[lastKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
    }
  }
  return { data, body: raw.slice(m[0].length) };
}

function parseNote(raw) {
  const { data, body } = parseFrontmatter(raw);

  const tags = new Set();
  const fmTags = data.tags ?? data.tag;
  (Array.isArray(fmTags) ? fmTags : fmTags ? [fmTags] : [])
    .forEach(t => tags.add(String(t).replace(/^#/, '')));
  const bodyNoCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const m of bodyNoCode.matchAll(/(?:^|\s)#([\p{L}\p{N}_\/-]+)/gu)) {
    if (!/^\d+$/.test(m[1])) tags.add(m[1]);
  }

  const links = [];
  const pdfs  = [];
  // [[Ziel]], ![[Ziel]], [[Ziel|Alias]], [[Ziel#Abschnitt]]
  for (const m of body.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const target = m[1].trim();
    if (/\.pdf$/i.test(target)) pdfs.push(target);
    else links.push(target);
  }
  // [Text](pfad/datei.pdf) bzw. ![](datei.pdf), auch URL-kodiert oder in <…>
  for (const m of body.matchAll(/!?\[[^\]]*\]\(<?([^)>]+?\.pdf)>?\)/gi)) {
    if (/^https?:/i.test(m[1])) continue;
    let target = m[1].trim();
    try { target = decodeURIComponent(target); } catch {}
    pdfs.push(target);
  }

  const h1 = body.match(/^#\s+(.+)$/m);
  return {
    frontmatter: data,
    body,
    tags: [...tags],
    links: [...new Set(links)],
    pdfs: [...new Set(pdfs)],
    h1: h1 ? h1[1].trim() : null,
  };
}

// ── DATEISYSTEM ────────────────────────────────────────

function walk(root) {
  const notes = [];
  const byName = new Map(); // basename (lowercase) → [relPath]
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(childRel);
        continue;
      }
      if (!e.isFile()) continue;
      const key = e.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(childRel);
      if (e.name.toLowerCase().endsWith('.md')) notes.push(childRel);
    }
  }
  return { notes, byName };
}

function attachmentFolder(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.obsidian', 'app.json'), 'utf8'));
    return cfg.attachmentFolderPath ?? null;
  } catch { return null; }
}

/**
 * Löst einen PDF-Link so auf wie Obsidian:
 * relativ zur Notiz → Vault-Root → Anhang-Ordner → eindeutiger Dateiname im Vault.
 * Gibt den relativen Pfad zurück oder null.
 */
function resolveAttachment(root, target, fromNote, byName, attDir) {
  const candidates = [
    path.join(path.dirname(fromNote), target),
    target,
  ];
  if (attDir) {
    const base = attDir.startsWith('./')
      ? path.join(path.dirname(fromNote), attDir.slice(2))
      : attDir;
    candidates.push(path.join(base, path.basename(target)));
  }
  for (const c of candidates) {
    const norm = path.normalize(c);
    if (norm.startsWith('..')) continue;
    if (fs.existsSync(path.join(root, norm))) return norm;
  }
  const hits = byName.get(path.basename(target).toLowerCase());
  return hits?.length ? hits[0] : null;
}

async function extractPdf(absPath) {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  // Als eigenständiges Uint8Array übergeben: readFileSync liefert kleine Dateien
  // aus dem Buffer-Pool (byteOffset ≠ 0), das bundled pdf.js liest dann falsche Bytes
  const res = await pdfParse(new Uint8Array(fs.readFileSync(absPath)));
  return { text: (res.text ?? '').slice(0, MAX_PDF_CHARS), pages: res.numpages ?? 0 };
}

// ── INDEX-LAUF ─────────────────────────────────────────

let _running = null;

/**
 * Bringt den Index auf den Stand des Vaults.
 * Nur geänderte Dateien (mtime) werden neu gelesen, gelöschte entfernt.
 * @param {{ full?: boolean }} opts - full=true baut alles neu auf
 * @returns {Promise<{ added:number, updated:number, removed:number, pdfs:number, total:number }>}
 */
function syncIndex(opts = {}) {
  if (_running) return _running;
  _running = _syncIndex(opts).finally(() => { _running = null; });
  return _running;
}

async function _syncIndex({ full = false } = {}) {
  const root = vaultPath();
  const stats = { added: 0, updated: 0, removed: 0, pdfs: 0, total: 0 };
  if (!fs.existsSync(root)) {
    log.warn(`[Vault-Index] VAULT_PATH nicht gefunden: ${root}`);
    return stats;
  }

  const db = getDb();
  if (full) db.exec('DELETE FROM notes; DELETE FROM notes_fts;');

  const known = new Map(db.prepare('SELECT id, path, mtime FROM notes').all().map(r => [r.path, r]));
  const pdfCache = db.prepare('SELECT mtime, text, pages FROM pdf_cache WHERE pdf_path = ?');
  const { notes, byName } = walk(root);
  const attDir = attachmentFolder(root);

  const changed = [];
  for (const rel of notes) {
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    if (st.size > MAX_NOTE_BYTES) continue;
    const mtime = Math.floor(st.mtimeMs);
    const prev = known.get(rel);
    known.delete(rel);
    if (prev && prev.mtime === mtime) continue;

    let raw;
    try { raw = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    const parsed = parseNote(raw);

    const pdfPaths = [];
    const pdfTexts = [];
    for (const target of parsed.pdfs) {
      const resolved = resolveAttachment(root, target, rel, byName, attDir);
      if (!resolved) continue;
      pdfPaths.push(resolved);
      try {
        const pst = fs.statSync(path.join(root, resolved));
        const pm = Math.floor(pst.mtimeMs);
        const cached = pdfCache.get(resolved);
        if (cached && cached.mtime === pm) {
          pdfTexts.push(cached.text);
        } else {
          const { text, pages } = await extractPdf(path.join(root, resolved));
          db.prepare('INSERT OR REPLACE INTO pdf_cache (pdf_path, mtime, text, pages) VALUES (?, ?, ?, ?)')
            .run(resolved, pm, text, pages);
          if (!text.trim() && pages > 0) log.warn(`[Vault-Index] PDF ohne Textebene (Scan?): ${resolved}`);
          pdfTexts.push(text);
          stats.pdfs++;
        }
      } catch (err) {
        log.warn(`[Vault-Index] PDF nicht lesbar: ${resolved} (${err.message})`);
      }
    }

    changed.push({ rel, prev, mtime, size: st.size, parsed, pdfPaths, pdfText: pdfTexts.join('\n\n') });
  }

  const upsert = db.transaction(() => {
    const insNote = db.prepare(`INSERT INTO notes (path, title, folder, tags, frontmatter, links, pdfs, mtime, size)
      VALUES (@path, @title, @folder, @tags, @frontmatter, @links, @pdfs, @mtime, @size)
      ON CONFLICT(path) DO UPDATE SET title=@title, folder=@folder, tags=@tags, frontmatter=@frontmatter,
        links=@links, pdfs=@pdfs, mtime=@mtime, size=@size`);
    const getId  = db.prepare('SELECT id FROM notes WHERE path = ?');
    const delFts = db.prepare('DELETE FROM notes_fts WHERE rowid = ?');
    const insFts = db.prepare('INSERT INTO notes_fts (rowid, title, tags, body, pdf_text) VALUES (?, ?, ?, ?, ?)');
    const delNote = db.prepare('DELETE FROM notes WHERE id = ?');

    for (const c of changed) {
      const title = path.basename(c.rel, path.extname(c.rel));
      insNote.run({
        path: c.rel,
        title,
        folder: path.dirname(c.rel) === '.' ? '' : path.dirname(c.rel),
        tags: c.parsed.tags.join(' '),
        frontmatter: JSON.stringify(c.parsed.frontmatter),
        links: JSON.stringify(c.parsed.links),
        pdfs: JSON.stringify(c.pdfPaths),
        mtime: c.mtime,
        size: c.size,
      });
      const id = getId.get(c.rel).id;
      delFts.run(id);
      insFts.run(id, [title, c.parsed.h1].filter(Boolean).join(' '), c.parsed.tags.join(' '), c.parsed.body, c.pdfText);
      if (c.prev) stats.updated++; else stats.added++;
    }
    // Was noch in `known` steht, existiert nicht mehr im Vault
    for (const gone of known.values()) {
      delFts.run(gone.id);
      delNote.run(gone.id);
      stats.removed++;
    }
  });
  upsert();

  stats.total = db.prepare('SELECT COUNT(*) AS n FROM notes').get().n;
  if (stats.added || stats.updated || stats.removed) {
    log.info(`[Vault-Index] +${stats.added} ~${stats.updated} -${stats.removed} (PDFs neu: ${stats.pdfs}, gesamt: ${stats.total})`);
  }
  return stats;
}

// ── SUCHE ──────────────────────────────────────────────

/** Schreibvarianten eines Wortes: ü ↔ ue, ö ↔ oe, ä ↔ ae, ß ↔ ss. */
function spellings(word) {
  const toAscii = word.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const toUml   = word.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
  return [...new Set([word, toAscii, toUml])];
}

/**
 * Baut aus Freitext eine FTS5-Abfrage. Jedes Wort wird gequotet (keine
 * FTS-Syntaxfehler durch Nutzereingaben), als Präfix gesucht und um
 * Umlaut-Schreibweisen erweitert ("Kündigung" findet auch "Kuendigung").
 */
function toFtsQuery(query, mode = 'AND') {
  const words = String(query)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2)
    .slice(0, 12);
  if (!words.length) return null;
  const terms = words.map(w => {
    const v = spellings(w).map(x => `"${x}"*`);
    return v.length > 1 ? `(${v.join(' OR ')})` : v[0];
  });
  return terms.join(mode === 'OR' ? ' OR ' : ' AND ');
}

/**
 * Volltextsuche über Notizen und verlinkte PDFs.
 * Erst alle Wörter (AND), bei null Treffern irgendein Wort (OR).
 * @returns {Array<{ path, title, folder, tags, pdfs, snippet, score }>}
 */
function search(query, { folder = null, tag = null, limit = 8 } = {}) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT n.path, n.title, n.folder, n.tags, n.pdfs, n.mtime,
           snippet(notes_fts, 2, '«', '»', ' … ', 24) AS body_snip,
           snippet(notes_fts, 3, '«', '»', ' … ', 24) AS pdf_snip,
           bm25(notes_fts, 10.0, 5.0, 1.0, 1.0) AS score
    FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
    WHERE notes_fts MATCH ?
      AND (? IS NULL OR n.folder = ? OR n.folder LIKE ? || '/%')
      AND (? IS NULL OR (' ' || n.tags || ' ') LIKE '% ' || ? || ' %')
    ORDER BY score
    LIMIT ?`);

  for (const mode of ['AND', 'OR']) {
    const fts = toFtsQuery(query, mode);
    if (!fts) return [];
    const rows = stmt.all(fts, folder, folder, folder, tag, tag, limit);
    if (rows.length) {
      return rows.map(r => ({
        path: r.path,
        title: r.title,
        folder: r.folder,
        tags: r.tags ? r.tags.split(' ') : [],
        pdfs: JSON.parse(r.pdfs || '[]'),
        modified: new Date(r.mtime).toISOString().slice(0, 10),
        snippet: (r.pdf_snip && r.pdf_snip.includes('«') && !r.body_snip.includes('«'))
          ? `[PDF] ${r.pdf_snip}` : r.body_snip,
        score: r.score,
      }));
    }
  }
  return [];
}

/** Zuletzt geänderte Notizen. */
function recent({ days = 7, folder = null, limit = 20 } = {}) {
  const since = Date.now() - days * 86400000;
  return getDb().prepare(`
    SELECT path, title, folder, mtime FROM notes
    WHERE mtime >= ? AND (? IS NULL OR folder = ? OR folder LIKE ? || '/%')
    ORDER BY mtime DESC LIMIT ?`).all(since, folder, folder, folder, limit)
    .map(r => ({ ...r, modified: new Date(r.mtime).toISOString().slice(0, 16).replace('T', ' ') }));
}

/** Gecachter PDF-Text (nach Index-Lauf). */
function pdfText(relPath) {
  return getDb().prepare('SELECT text FROM pdf_cache WHERE pdf_path = ?').get(relPath)?.text ?? null;
}

/** Metadaten einer indexierten Notiz (aufgelöste PDF-Pfade etc.). */
function noteMeta(relPath) {
  const r = getDb().prepare('SELECT path, title, folder, tags, pdfs, links FROM notes WHERE path = ?').get(relPath);
  if (!r) return null;
  return { ...r, tags: r.tags ? r.tags.split(' ') : [], pdfs: JSON.parse(r.pdfs || '[]'), links: JSON.parse(r.links || '[]') };
}

/** obsidian://-Link, öffnet die Notiz direkt in der App (Mac + iPhone). */
function obsidianLink(relPath) {
  const vaultName = process.env.VAULT_NAME || path.basename(vaultPath());
  const file = relPath.replace(/\.md$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}

module.exports = {
  syncIndex, search, recent, pdfText, noteMeta, obsidianLink,
  parseNote, toFtsQuery, vaultPath, close,
};
