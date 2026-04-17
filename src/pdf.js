// src/pdf.js
// PDF-Export der Deliberation-Ergebnisse
// Erstellt eine grafisch ansprechende PDF-Datei und oeffnet sie automatisch

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEPT_COLORS = {
  strategy:  { bg: '#ec4899', light: '#fdf2f8' },
  finance:   { bg: '#4f6ef7', light: '#eef2ff' },
  marketing: { bg: '#f59e0b', light: '#fffbeb' },
  sales:     { bg: '#22d3ee', light: '#ecfeff' },
  hr:        { bg: '#a78bfa', light: '#f5f3ff' },
  rd:        { bg: '#2dd4a0', light: '#f0fdf4' },
  legal:     { bg: '#ef4444', light: '#fef2f2' },
  ops:       { bg: '#f97316', light: '#fff7ed' },
  ceo:       { bg: '#1e2433', light: '#f8fafc' },
};

const DEPT_NAMES = {
  strategy: 'Strategie', finance: 'Finanzen', marketing: 'Marketing',
  sales: 'Sales', hr: 'HR', rd: 'F&E', legal: 'Legal', ops: 'Operations',
};

function buildHTML(data) {
  const { topic, phase1, phase2, decision, timestamp, globalCtx } = data;
  const date = new Date(timestamp).toLocaleDateString('de-AT', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const agentCards = (phases, subtitle) => Object.entries(phases).map(([id, text]) => {
    const c = DEPT_COLORS[id] || { bg: '#64748b', light: '#f8fafc' };
    const name = DEPT_NAMES[id] || id;
    return `
      <div class="agent-card">
        <div class="agent-header" style="background:${c.bg}">
          <span class="agent-name">${name}</span>
          <span class="agent-phase">${subtitle}</span>
        </div>
        <div class="agent-body" style="background:${c.light}">
          <p>${text.replace(/\n/g, '<br>')}</p>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', sans-serif;
    background: #fff;
    color: #1e293b;
    font-size: 10pt;
    line-height: 1.6;
  }

  /* COVER */
  .cover {
    background: linear-gradient(135deg, #060810 0%, #1e2433 100%);
    min-height: 240px;
    padding: 48px 56px 40px;
    color: white;
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 280px; height: 280px;
    background: radial-gradient(circle, rgba(79,110,247,0.3) 0%, transparent 70%);
  }
  .cover-label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #4f6ef7;
    margin-bottom: 16px;
    font-weight: 600;
  }
  .cover-title {
    font-family: 'Playfair Display', serif;
    font-size: 22pt;
    line-height: 1.2;
    margin-bottom: 20px;
    max-width: 600px;
  }
  .cover-meta {
    display: flex;
    gap: 32px;
    font-size: 8pt;
    color: rgba(255,255,255,0.5);
    margin-top: 24px;
  }
  .cover-meta span { display: flex; flex-direction: column; gap: 2px; }
  .cover-meta strong { color: rgba(255,255,255,0.9); font-size: 9pt; }

  /* CONTEXT BOX */
  .context-box {
    margin: 28px 56px 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #4f6ef7;
    border-radius: 6px;
    padding: 14px 18px;
    font-size: 8.5pt;
    color: #475569;
  }
  .context-box strong { color: #1e293b; display: block; margin-bottom: 4px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; }

  /* SECTION */
  .section {
    padding: 28px 56px 0;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 2px solid #f1f5f9;
  }
  .section-num {
    width: 26px; height: 26px;
    background: #1e2433;
    color: white;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 8pt; font-weight: 700; flex-shrink: 0;
  }
  .section-title {
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .section-sub {
    font-size: 7.5pt;
    color: #94a3b8;
    margin-left: auto;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* AGENT GRID */
  .agent-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 8px;
  }
  .agent-card {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }
  .agent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
  }
  .agent-name {
    font-size: 8pt;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .agent-phase {
    font-size: 6.5pt;
    color: rgba(255,255,255,0.7);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .agent-body {
    padding: 10px 12px;
    font-size: 8.5pt;
    color: #374151;
    line-height: 1.55;
  }

  /* CEO DECISION */
  .decision-box {
    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
    border: 1px solid #86efac;
    border-radius: 10px;
    padding: 20px 24px;
    margin-bottom: 8px;
  }
  .decision-label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #16a34a;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .decision-text {
    font-size: 9.5pt;
    color: #14532d;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  /* FOOTER */
  .footer {
    margin: 32px 56px 0;
    padding: 16px 0;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #94a3b8;
  }

  /* PAGE BREAK */
  .page-break { page-break-before: always; padding-top: 28px; }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-label">Company OS — Deliberation Report</div>
  <div class="cover-title">${topic}</div>
  <div class="cover-meta">
    <span><strong>${date}</strong>Erstellt</span>
    <span><strong>3 Phasen</strong>Deliberation</span>
    <span><strong>8 Agenten</strong>+ CEO-Synthese</span>
  </div>
</div>

${globalCtx ? `
<div class="context-box">
  <strong>Unternehmenskontext</strong>
  ${globalCtx}
</div>` : ''}

<!-- PHASE 1 -->
<div class="section">
  <div class="section-header">
    <div class="section-num">1</div>
    <div class="section-title">Erstanalyse</div>
    <div class="section-sub">Alle Abteilungen parallel</div>
  </div>
  <div class="agent-grid">
    ${agentCards(phase1, 'Erstanalyse')}
  </div>
</div>

<!-- PHASE 2 -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">2</div>
    <div class="section-title">Deliberation</div>
    <div class="section-sub">Reaktion auf andere Abteilungen</div>
  </div>
  <div class="agent-grid">
    ${agentCards(phase2, 'Deliberation')}
  </div>
</div>

<!-- CEO -->
<div class="section" style="margin-top:24px">
  <div class="section-header">
    <div class="section-num">3</div>
    <div class="section-title">CEO-Entscheidung</div>
    <div class="section-sub">Synthese + Handlungsplan</div>
  </div>
  <div class="decision-box">
    <div class="decision-label">Entscheidung &amp; Massnahmen</div>
    <div class="decision-text">${decision.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>
</div>

<div class="footer">
  <span>Company OS — autonomes Multi-Agent-System</span>
  <span>${date}</span>
</div>

</body>
</html>`;
}

async function generatePDF(data, outputDir) {
  // HTML erstellen
  const html = buildHTML(data);
  const htmlPath = path.join(os.tmpdir(), `company-os-report-${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Output-Ordner
  const reportsDir = outputDir || path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const slug = data.topic.slice(0, 40).replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '-').replace(/-+/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  const pdfPath = path.join(reportsDir, `${datePart}-${slug}.pdf`);

  // Puppeteer für PDF
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '20mm', left: '0' },
      printBackground: true,
    });
    await browser.close();
    fs.unlinkSync(htmlPath);

    // PDF automatisch öffnen
    openFile(pdfPath);
    return pdfPath;

  } catch (err) {
    // Fallback: HTML öffnen wenn Puppeteer fehlt
    console.log('\n[PDF] Puppeteer nicht installiert — öffne HTML-Version.');
    openFile(htmlPath);
    return htmlPath;
  }
}

function openFile(filePath) {
  const platform = os.platform();
  try {
    if (platform === 'darwin') execSync(`open "${filePath}"`);
    else if (platform === 'linux') execSync(`xdg-open "${filePath}" 2>/dev/null || true`);
    else if (platform === 'win32') execSync(`start "" "${filePath}"`);
  } catch {}
}

module.exports = { generatePDF };
