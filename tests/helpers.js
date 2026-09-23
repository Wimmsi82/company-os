// tests/helpers.js — gemeinsame Test-Helfer (Beispiel-Vault, Mini-PDF)

const fs   = require('fs');
const os   = require('os');
const path = require('path');

/** Erzeugt ein minimales, gültiges PDF mit einer Textzeile (nur ASCII). */
function makePdf(text) {
  const esc = text.replace(/[\\()]/g, m => '\\' + m);
  const stream = `BT /F1 12 Tf 50 750 Td (${esc}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { out += `${String(o).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Legt einen Beispiel-Vault in einem Temp-Ordner an und setzt die Env-Variablen. */
function makeVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-vault-'));
  const vault = path.join(dir, 'Vault');
  const w = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
    fs.writeFileSync(path.join(vault, rel), content);
  };
  w('.obsidian/app.json', JSON.stringify({ attachmentFolderPath: 'Anhaenge' }));
  w('Anhaenge/Mietvertrag Wohnung.pdf', makePdf('Die Kuendigungsfrist betraegt drei Monate zum Quartalsende. Miete 1.250 EUR.'));
  w('Projekte/Vertraege/Mietvertrag.md', '---\ntags: [vertrag, wohnen]\n---\n# Mietvertrag Wohnung Salzburg\n\nVermieter: Huber GmbH\n\n![[Mietvertrag Wohnung.pdf]]\n');
  w('Projekte/Vertraege/Leasing.md', '# Leasing\n\nSiehe [Vertrag](../../Anhaenge/Leasing%20Auto.pdf) #auto\n');
  w('Anhaenge/Leasing Auto.pdf', makePdf('Leasingrate 399 EUR monatlich, Laufzeit 48 Monate.'));
  w('Projekte/Berthos/Seed-Runde.md', '# Seed-Runde\n\nZiel: 800k Seed-Finanzierung für Berthos. Gespräch mit Investoren im Oktober. Kündigung kein Thema.\n');
  w('Inbox/Idee: Bonsai am Pi.md', 'Bonsai 2 27B lokal testen.\n');
  w('.trash/alt.md', 'Mietvertrag geheim');

  process.env.VAULT_PATH = vault;
  process.env.VAULT_NAME = 'Vault';
  process.env.VAULT_INDEX_DB = path.join(dir, 'vault-index.sqlite');
  process.env.ASSISTANT_DB = path.join(dir, 'assistant.sqlite');
  return { dir, vault, write: w };
}

module.exports = { makePdf, makeVault };
