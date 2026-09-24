#!/usr/bin/env node
// scripts/rename-colon-notes.js
// Benennt Vault-Dateien mit ":" im Namen um ("Ref: Titel.md" → "Ref - Titel.md")
// und passt alle Links darauf an. Obsidian und Obsidian Sync lehnen ":" in
// Dateinamen ab, solche Notizen landen daher auf keinem anderen Gerät.
//
// Nutzung (auf dem Mac, Obsidian vorher schliessen):
//   node rename-colon-notes.js <vault>                 Probelauf, ändert nichts
//   node rename-colon-notes.js <vault> --list          Probelauf mit allen Umbenennungen
//   node rename-colon-notes.js <vault> --apply         umbenennen, vorher Backup nach ~/obsidian-rename-backup-<zeit>/
//   node rename-colon-notes.js --undo <backup>/manifest.json   alles zurück
//
// Versteckte Ordner (.obsidian, .trash, …) und node_modules bleiben unberührt.

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const LINK_EXT = new Set(['.md', '.canvas']);

function newBaseName(base) {
  const ext  = path.extname(base);
  let stem   = base.slice(0, base.length - ext.length);
  stem = stem
    .replace(/^(Idee|Ref|Log)\s*:\s*/i, '$1 - ')
    .replace(/\s*:\s+/g, ' - ')
    .replace(/:/g, '-')
    .replace(/ {2,}/g, ' ')
    .trim();
  return stem + ext;
}

function walk(root) {
  const files = [], colonDirs = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.includes(':')) colonDirs.push(childRel);
        stack.push(childRel);
      } else if (e.isFile()) files.push(childRel);
    }
  }
  return { files: files.sort(), colonDirs: colonDirs.sort() };
}

function stripMd(s) { return s.toLowerCase().endsWith('.md') ? s.slice(0, -3) : s; }

function plan(root) {
  const { files, colonDirs } = walk(root);
  const existing = new Set(files.map(f => f.toLowerCase()));
  const renames = [], skipped = [];
  const taken = new Set();
  for (const rel of files) {
    const base = path.posix.basename(rel);
    if (!base.includes(':')) continue;
    const to = path.posix.join(path.posix.dirname(rel), newBaseName(base)).replace(/^\.\//, '');
    const key = to.toLowerCase();
    if (existing.has(key) || taken.has(key)) { skipped.push({ from: rel, to, reason: 'Ziel existiert schon' }); continue; }
    taken.add(key);
    renames.push({ from: rel, to });
  }

  // Link-Ziele: Wikilinks nutzen den Namen ohne .md (oder den Pfad), andere Dateien den vollen Namen
  const byName = new Map();
  for (const r of renames) {
    const oldBase = path.posix.basename(r.from), newBase = path.posix.basename(r.to);
    byName.set(stripMd(oldBase), stripMd(newBase));
    byName.set(oldBase, newBase);
  }

  const mapTarget = (target) => {
    const slash = target.lastIndexOf('/');
    const dir = slash >= 0 ? target.slice(0, slash + 1) : '';
    const last = target.slice(slash + 1);
    const hit = byName.get(last);
    return hit === undefined ? null : dir + hit;
  };

  const edits = [];
  let linkCount = 0;
  for (const rel of files) {
    if (!LINK_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(root, rel);
    const text = fs.readFileSync(abs, 'utf8');
    if (!text.includes(':') && !/%3a/i.test(text)) continue;
    let n = 0;
    let out = text.replace(/(!?\[\[)([^\]\n]+?)(\]\])/g, (all, open, inner, close) => {
      const m = inner.match(/^([^#|]+)([#|][\s\S]*)?$/);
      if (!m || !m[1].includes(':')) return all;
      const mapped = mapTarget(m[1].trim());
      if (mapped === null) return all;
      n++;
      return `${open}${mapped}${m[2] ?? ''}${close}`;
    });
    out = out.replace(/(\]\()(<[^>\n]+>|[^)\s]+)(\))/g, (all, open, url, close) => {
      const angle = url.startsWith('<');
      const raw = angle ? url.slice(1, -1) : url;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(mailto|obsidian):/i.test(raw)) return all;
      let decoded;
      // decodeURI lässt %3A stehen, deshalb decodeURIComponent
      try { decoded = decodeURIComponent(raw); } catch { return all; }
      const [p, frag = ''] = decoded.split('#');
      if (!p.includes(':')) return all;
      const mapped = mapTarget(p);
      if (mapped === null) return all;
      n++;
      const target = mapped + (frag ? `#${frag}` : '');
      return `${open}${angle ? `<${target}>` : encodeURI(target)}${close}`;
    });
    if (rel.toLowerCase().endsWith('.canvas')) {
      for (const r of renames) {
        const before = out;
        out = out.split(JSON.stringify(r.from)).join(JSON.stringify(r.to));
        if (out !== before) n++;
      }
    }
    if (n) { edits.push({ rel, text: out }); linkCount += n; }
  }
  return { renames, skipped, colonDirs, edits, linkCount };
}

function apply(root, p, backupRoot) {
  fs.mkdirSync(backupRoot, { recursive: true });
  const backup = (rel) => {
    const dest = path.join(backupRoot, 'files', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(root, rel), dest);
  };
  for (const e of p.edits) backup(e.rel);
  for (const r of p.renames) backup(r.from);
  const manifest = { vault: root, created: new Date().toISOString(), renames: p.renames, edited: p.edits.map(e => e.rel) };
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const e of p.edits) fs.writeFileSync(path.join(root, e.rel), e.text, 'utf8');
  for (const r of p.renames) {
    const to = path.join(root, r.to);
    if (fs.existsSync(to)) throw new Error(`Ziel existiert inzwischen: ${r.to} (abgebrochen, Rückweg: --undo)`);
    fs.renameSync(path.join(root, r.from), to);
  }
  return manifest;
}

function undo(manifestPath) {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const backupRoot = path.dirname(manifestPath);
  let back = 0;
  for (const r of [...m.renames].reverse()) {
    const to = path.join(m.vault, r.to), from = path.join(m.vault, r.from);
    if (fs.existsSync(to) && !fs.existsSync(from)) { fs.renameSync(to, from); back++; }
  }
  const restore = new Set([...m.edited, ...m.renames.map(r => r.from)]);
  for (const rel of restore) {
    const src = path.join(backupRoot, 'files', rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(m.vault, rel));
  }
  return { back, restored: restore.size };
}

function main(argv) {
  if (argv[0] === '--undo') {
    if (!argv[1]) { console.error('Nutzung: --undo <backup>/manifest.json'); process.exit(1); }
    const r = undo(path.resolve(argv[1]));
    console.log(`Rückgängig: ${r.back} Dateien zurückbenannt, ${r.restored} Dateien aus dem Backup wiederhergestellt.`);
    return;
  }
  const root = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0].replace(/^~(?=\/|$)/, os.homedir())) : null;
  if (!root || !fs.existsSync(path.join(root, '.obsidian'))) {
    console.error('Nutzung: node rename-colon-notes.js <vault-ordner> [--list] [--apply]\n(Der Ordner muss einen .obsidian-Unterordner haben.)');
    process.exit(1);
  }
  const p = plan(root);
  console.log(`Vault:              ${root}`);
  console.log(`Umbenennen:         ${p.renames.length} Dateien`);
  console.log(`Links anpassen:     ${p.linkCount} Links in ${p.edits.length} Dateien`);
  console.log(`Übersprungen:       ${p.skipped.length} (Zielname existiert schon)`);
  if (p.colonDirs.length) console.log(`Ordner mit ":":     ${p.colonDirs.length} (werden NICHT umbenannt): ${p.colonDirs.slice(0, 5).join(', ')}`);
  const show = argv.includes('--list') ? p.renames : p.renames.slice(0, 10);
  if (show.length) console.log('\nBeispiele:'), show.forEach(r => console.log(`  ${r.from}\n    → ${r.to}`));
  if (p.renames.length > show.length) console.log(`  … und ${p.renames.length - show.length} weitere (alle mit --list)`);
  p.skipped.forEach(s => console.log(`  ÜBERSPRUNGEN ${s.from} → ${s.to}: ${s.reason}`));

  if (!argv.includes('--apply')) { console.log('\nProbelauf, nichts geändert. Zum Ausführen: --apply'); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupRoot = path.join(os.homedir(), `obsidian-rename-backup-${stamp}`);
  apply(root, p, backupRoot);
  console.log(`\nFertig. Backup und Liste: ${backupRoot}`);
  console.log(`Rückgängig: node rename-colon-notes.js --undo "${path.join(backupRoot, 'manifest.json')}"`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { newBaseName, plan, apply, undo };
