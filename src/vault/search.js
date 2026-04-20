// src/vault/search.js
// Keyword-Suche über Vault Cycle-Logs — liefert relevante Vergangenheit als RAG-Kontext

const fs   = require('fs');
const path = require('path');

const VAULT_PATH = process.env.VAULT_PATH || path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault'
);
const VAULT_PROJECTS = path.join(VAULT_PATH, 'Projekte', 'company-os');

/**
 * Durchsucht Vault Cycle-Logs nach Einträgen die zum Thema passen.
 * Gibt einen formatierten Kontext-String zurück (oder '' wenn kein Treffer).
 * @param {string} topic - Deliberations-Thema
 * @param {number} maxResults - Maximale Anzahl Treffer (default: 3)
 * @returns {string}
 */
function searchCycleHistory(topic, maxResults = 3) {
  try {
    if (!fs.existsSync(VAULT_PROJECTS)) return '';

    // Stopwörter rausfiltern, Wörter mit >3 Zeichen behalten
    const stopWords = new Set(['dass', 'oder', 'aber', 'auch', 'eine', 'einen', 'wird', 'sind', 'haben', 'nicht', 'with', 'that', 'this', 'from', 'what', 'when', 'they', 'will']);
    const topicWords = topic.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 12);

    if (!topicWords.length) return '';

    const files = fs.readdirSync(VAULT_PROJECTS)
      .filter(f => f.endsWith('.md') && f.startsWith('Log:'));

    if (!files.length) return '';

    // Dateien nach Keyword-Relevanz bewerten
    const scored = files.map(f => {
      const filepath = path.join(VAULT_PROJECTS, f);
      try {
        const raw     = fs.readFileSync(filepath, 'utf8');
        const lower   = raw.toLowerCase();
        const score   = topicWords.reduce((acc, w) => {
          const matches = (lower.match(new RegExp(w, 'g')) ?? []).length;
          return acc + matches;
        }, 0);
        return { filename: f, raw, score };
      } catch {
        return { filename: f, raw: '', score: 0 };
      }
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

    if (!scored.length) return '';

    const excerpts = scored.map(({ filename, raw }) => {
      // CEO-Synthese-Abschnitt extrahieren wenn vorhanden
      const ceoPart = raw.match(/## CEO-Synthese\n([\s\S]*?)(?=\n## |\n---|\z)/);
      const preview = ceoPart
        ? ceoPart[1].trim().slice(0, 500)
        : raw.split('\n')
            .filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('#'))
            .slice(0, 8)
            .join('\n')
            .slice(0, 500);

      // Dateiname als Titel: "Log: company-os Zyklus X - Thema DATUM.md"
      const title = filename.replace(/^Log: company-os /, '').replace('.md', '');
      return `**${title}**\n${preview}`;
    });

    return excerpts.join('\n\n---\n\n');
  } catch (err) {
    return '';
  }
}

module.exports = { searchCycleHistory };
