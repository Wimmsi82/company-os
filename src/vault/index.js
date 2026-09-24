// src/vault/index.js
// Vault-Integration (Input + Output) für die Deliberation.
// INPUT:  readVaultContext(topic)   — Kontext-Notizen aus dem Vault in den Prompt einspeisen
// OUTPUT: writeCycleLog(...)        — Ergebnis jeder Deliberation als Log-Notiz sichern
//         writeAlertToInbox(...)    — Metrik-Alerts als Inbox-Notiz sichtbar machen
//
// Bewusst nur additiv und fehlertolerant: jede Funktion fängt eigene Fehler ab
// und liefert im Fehlerfall einen leeren/neutralen Wert, statt die Deliberation
// oder den Cron-Lauf abzubrechen (siehe CLAUDE.md: try/catch bei jedem Aufruf).

const fs   = require('fs');
const path = require('path');
const log  = require('../utils/log');

function vaultPath() {
  return process.env.VAULT_PATH || path.join(
    process.env.HOME ?? '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault'
  );
}

const PROJECT_DIR = () => path.join(vaultPath(), 'Projekte', 'company-os');
const INBOX_DIR    = () => path.join(vaultPath(), 'Inbox');
// Alte Notizen heissen "Log: …", neue "Log - …" (":" synct Obsidian nicht)
const LOG_NOTE = /^Log(?::| -) /;

function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '-').trim();
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Liest zusätzlichen Kontext aus dem Vault (Kontext-Notizen unter
 * Projekte/company-os/Kontext/ bzw. eine globale Kontext.md), passend zum
 * Deliberationsthema. Reine Best-Effort-Ergänzung — liefert '' wenn nichts
 * gefunden wird oder der Vault nicht erreichbar ist.
 * @param {string} topic
 * @returns {string}
 */
function readVaultContext(topic) {
  try {
    const dir = PROJECT_DIR();
    if (!fs.existsSync(dir)) return '';

    const stopWords = new Set(['dass', 'oder', 'aber', 'auch', 'eine', 'einen', 'wird', 'sind', 'haben', 'nicht', 'with', 'that', 'this', 'from', 'what', 'when', 'they', 'will']);
    const words = String(topic).toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    // Kontext-Notizen: alles ausser den Cycle-Logs (siehe search.js)
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !LOG_NOTE.test(f));
    if (!files.length) return '';

    const matches = files.filter(f => {
      if (!words.length) return true;
      const lower = f.toLowerCase();
      return words.some(w => lower.includes(w));
    });
    const chosen = (matches.length ? matches : files).slice(0, 3);

    const blocks = chosen.map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''); // Frontmatter entfernen
      return `**${f.replace(/\.md$/, '')}**\n${body.trim().slice(0, 800)}`;
    });

    return blocks.length ? `\n\n=== VAULT-KONTEXT ===\n${blocks.join('\n\n---\n\n')}` : '';
  } catch (err) {
    log.warn(`[Vault] readVaultContext fehlgeschlagen: ${err.message}`);
    return '';
  }
}

/**
 * Schreibt das Ergebnis einer Deliberation als Log-Notiz, passend zum Format,
 * das src/vault/search.js für die Cycle-History-RAG erwartet: Dateiname
 * "Log - company-os Zyklus {id} - {topic} {datum}.md" mit einem
 * "## CEO-Synthese"-Abschnitt.
 * @param {{ cycleId, topic, phase1: Record<string,string>, phase2: Record<string,string>, decision: string }} args
 */
function writeCycleLog({ cycleId, topic, phase1 = {}, phase2 = {}, decision = '' }) {
  try {
    const dir = PROJECT_DIR();
    fs.mkdirSync(dir, { recursive: true });

    const shortTopic = safeName(String(topic).slice(0, 60));
    const filename = `Log - company-os Zyklus ${cycleId} - ${shortTopic} ${today()}.md`;

    const section = (title, obj) => {
      const entries = Object.entries(obj);
      if (!entries.length) return '';
      return `\n## ${title}\n\n` + entries.map(([dept, text]) => `### ${dept}\n${String(text).trim()}`).join('\n\n');
    };

    const content = [
      '---',
      `cycle_id: ${cycleId}`,
      `created: ${today()}`,
      'source: company-os',
      '---',
      `# ${topic}`,
      section('Phase 1 — Erstanalyse', phase1),
      section('Phase 2 — Deliberation', phase2),
      '\n## CEO-Synthese\n',
      String(decision ?? '').trim(),
      '',
    ].join('\n');

    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
    log.info(`[Vault] Cycle-Log geschrieben: ${filename}`);
  } catch (err) {
    log.warn(`[Vault] writeCycleLog fehlgeschlagen: ${err.message}`);
  }
}

/**
 * Schreibt einen Metrik-Alert als Notiz in Inbox/, damit er beim nächsten
 * Obsidian-Öffnen sichtbar ist — unabhängig vom Dashboard/Telegram.
 * @param {string} name
 * @param {number} value
 * @param {number} threshold
 * @param {string} dept - zuständige Abteilung
 */
function writeAlertToInbox(name, value, threshold, dept) {
  try {
    const dir = INBOX_DIR();
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Log - Metrik-Alert ${safeName(name)} ${stamp}.md`;
    const content = [
      '---',
      `created: ${today()}`,
      'source: company-os',
      'type: metric-alert',
      '---',
      `# Metrik-Alert: ${name}`,
      '',
      `Aktueller Wert: **${value}**`,
      `Schwellenwert: **${threshold}**`,
      `Zuständige Abteilung: **${dept}**`,
      '',
    ].join('\n');

    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
    log.info(`[Vault] Alert-Notiz geschrieben: ${filename}`);
  } catch (err) {
    log.warn(`[Vault] writeAlertToInbox fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { readVaultContext, writeCycleLog, writeAlertToInbox };
