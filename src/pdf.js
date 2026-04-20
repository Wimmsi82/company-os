// src/pdf.js
// Deliberations-Protokoll als PDF
// v2: Protokoll-Stil, SWOT-Analyse, Positionsmatrix, klare Handlungsempfehlungen

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { execSync }  = require('child_process');

// ── FARBEN PRO ABTEILUNG ────────────────────────────────

const DEPT_COLORS = {
  strategy:  { bg: '#6366f1', light: '#eef2ff', dot: '#6366f1' },
  finance:   { bg: '#0ea5e9', light: '#f0f9ff', dot: '#0ea5e9' },
  marketing: { bg: '#f59e0b', light: '#fffbeb', dot: '#f59e0b' },
  sales:     { bg: '#10b981', light: '#f0fdf4', dot: '#10b981' },
  hr:        { bg: '#a78bfa', light: '#f5f3ff', dot: '#a78bfa' },
  rd:        { bg: '#06b6d4', light: '#ecfeff', dot: '#06b6d4' },
  legal:     { bg: '#ef4444', light: '#fef2f2', dot: '#ef4444' },
  ops:       { bg: '#f97316', light: '#fff7ed', dot: '#f97316' },
};

const DEPT_NAMES = {
  strategy: 'Strategie (Marcus)', finance: 'Finanzen (Michael)',
  marketing: 'Marketing (Lena)',  sales: 'Sales (Sandra)',
  hr: 'HR (Sarah)',               rd: 'F&E (Jan)',
  legal: 'Legal (Claudia)',       ops: 'Operations (Elena)',
};

const POSITION_CONFIG = {
  pro:     { color: '#16a34a', bg: '#dcfce7', border: '#86efac', label: 'Dafür'    },
  neutral: { color: '#92400e', bg: '#fef3c7', border: '#fcd34d', label: 'Neutral'  },
  contra:  { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', label: 'Dagegen'  },
};

// ── HTML-GENERATOR ──────────────────────────────────────

function buildHTML(data) {
  const { topic, phase1, phase2, decision, ceoResult = {}, timestamp, globalCtx } = data;

  const date = new Date(timestamp).toLocaleDateString('de-AT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const time = new Date(timestamp).toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit',
  });

  const agentCount = Object.keys(phase1 ?? {}).length;

  // CEO-strukturierte Daten
  const swot           = ceoResult.swot ?? null;
  const agentPositions = ceoResult.agent_positions ?? {};
  const actionItems    = ceoResult.action_items ?? [];
  const decisionVerb   = (ceoResult.decision ?? '').toUpperCase();
  const decisionBadgeColor =
    ceoResult.decision === 'ja'    ? '#16a34a' :
    ceoResult.decision === 'nein'  ? '#dc2626' : '#d97706';

  // ── Teilabschnitte ──

  const renderAgentCards = (phases) => Object.entries(phases ?? {}).map(([id, text]) => {
    const c    = DEPT_COLORS[id] ?? { bg: '#64748b', light: '#f8fafc' };
    const name = DEPT_NAMES[id]  ?? id;
    return `
      <div class="agent-card">
        <div class="agent-header" style="background:${c.bg}">
          <span class="agent-name">${name}</span>
        </div>
        <div class="agent-body" style="background:${c.light}">
          ${text.replace(/\n/g, '<br>')}
        </div>
      </div>`;
  }).join('');

  const renderSwot = () => {
    if (!swot) return '';
    const cell = (items, title, color, bg) => `
      <div class="swot-cell" style="background:${bg};border-color:${color}">
        <div class="swot-label" style="color:${color}">${title}</div>
        <ul class="swot-list">
          ${(items ?? []).map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>`;
    return `
      <div class="section">
        <div class="section-header">
          <div class="section-num">2</div>
          <div class="section-title">SWOT-Analyse</div>
          <div class="section-sub">bezogen auf die Fragestellung</div>
        </div>
        <div class="swot-grid">
          ${cell(swot.strengths,    'Stärken',    '#16a34a', '#f0fdf4')}
          ${cell(swot.weaknesses,   'Schwächen',  '#dc2626', '#fef2f2')}
          ${cell(swot.opportunities,'Chancen',    '#2563eb', '#eff6ff')}
          ${cell(swot.threats,      'Risiken',    '#d97706', '#fffbeb')}
        </div>
      </div>`;
  };

  const renderPositionMatrix = () => {
    const entries = Object.entries(agentPositions);
    if (!entries.length) return '';
    const rows = entries.map(([id, pos]) => {
      const c   = DEPT_COLORS[id] ?? { bg: '#64748b', dot: '#64748b' };
      const p   = POSITION_CONFIG[pos] ?? POSITION_CONFIG.neutral;
      const name = DEPT_NAMES[id] ?? id;
      return `
        <tr>
          <td class="pos-dept">
            <span class="pos-dot" style="background:${c.dot}"></span>${name}
          </td>
          <td class="pos-bar-cell">
            <div class="pos-bar-track">
              <div class="pos-bar-fill" style="background:${p.color};
                width:${pos==='contra'?'33%':pos==='neutral'?'50%':'80%'};
                margin-left:${pos==='contra'?'0':pos==='neutral'?'25%':'20%'}">
              </div>
            </div>
          </td>
          <td class="pos-badge-cell">
            <span class="pos-badge" style="background:${p.bg};color:${p.color};border:1px solid ${p.border}">
              ${p.label}
            </span>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="section">
        <div class="section-header">
          <div class="section-num">3</div>
          <div class="section-title">Positionsmatrix</div>
          <div class="section-sub">Haltung der Abteilungen zur Fragestellung</div>
        </div>
        <div class="pos-legend">
          <span style="color:#dc2626">◀ Dagegen</span>
          <span style="color:#92400e">Neutral</span>
          <span style="color:#16a34a">Dafür ▶</span>
        </div>
        <table class="pos-table">
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  const renderActionItems = () => {
    if (!actionItems.length) return '';
    const rows = actionItems.map((a, i) => {
      const c = DEPT_COLORS[a.owner] ?? { bg: '#64748b' };
      const due = a.deadline_days ? `${a.deadline_days}d` : '–';
      return `
        <tr>
          <td class="ai-num">${i + 1}</td>
          <td class="ai-owner">
            <span class="ai-dot" style="background:${c.bg}"></span>
            ${(DEPT_NAMES[a.owner] ?? a.owner).split(' ')[0]}
          </td>
          <td class="ai-action">${a.action}</td>
          <td class="ai-due">${due}</td>
        </tr>`;
    }).join('');
    return `
      <table class="ai-table">
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th style="width:110px">Abteilung</th>
            <th>Massnahme</th>
            <th style="width:45px">Frist</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  // ── HTML KOMPLETT ──

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',Arial,sans-serif; background:#fff; color:#1e293b; font-size:9.5pt; line-height:1.55; }

  /* ── PROTOKOLL-KOPF ── */
  .proto-head {
    padding: 28px 48px 20px;
    border-bottom: 2.5px solid #1e293b;
  }
  .proto-label {
    font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:.18em;
    color:#64748b; margin-bottom:10px;
  }
  .proto-topic {
    font-size:17pt; font-weight:700; letter-spacing:-.02em; color:#0f172a;
    line-height:1.2; margin-bottom:14px; max-width:580px;
  }
  .proto-meta {
    display:flex; gap:32px; font-size:7.5pt; color:#64748b; flex-wrap:wrap;
  }
  .proto-meta-item { display:flex; flex-direction:column; gap:1px; }
  .proto-meta-label { font-size:6.5pt; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; }
  .proto-meta-val { font-weight:600; color:#334155; }

  /* ── SECTIONS ── */
  .section { padding: 20px 48px 0; }
  .section-header {
    display:flex; align-items:center; gap:10px;
    padding-bottom:8px; border-bottom:1.5px solid #e2e8f0; margin-bottom:14px;
  }
  .section-num {
    width:22px; height:22px; background:#1e293b; color:white; border-radius:4px;
    display:flex; align-items:center; justify-content:center;
    font-size:7.5pt; font-weight:700; flex-shrink:0; font-variant-numeric:tabular-nums;
  }
  .section-title { font-size:10pt; font-weight:700; color:#0f172a; letter-spacing:-.01em; }
  .section-sub { font-size:7pt; color:#94a3b8; margin-left:auto; text-transform:uppercase; letter-spacing:.07em; }

  /* ── KONTEXT ── */
  .ctx-box {
    background:#f8fafc; border:1px solid #e2e8f0; border-left:3px solid #6366f1;
    border-radius:5px; padding:10px 14px; font-size:8pt; color:#475569; line-height:1.5;
  }

  /* ── SWOT ── */
  .swot-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .swot-cell { border:1px solid; border-radius:6px; padding:10px 12px; }
  .swot-label {
    font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:.12em;
    margin-bottom:6px;
  }
  .swot-list { list-style:none; padding:0; }
  .swot-list li { font-size:8pt; color:#374151; padding:2px 0 2px 12px; position:relative; line-height:1.4; }
  .swot-list li::before { content:'–'; position:absolute; left:0; color:#94a3b8; }

  /* ── POSITIONSMATRIX ── */
  .pos-legend {
    display:flex; justify-content:space-between; font-size:7pt; font-weight:600;
    padding:0 4px; margin-bottom:6px; color:#64748b;
  }
  .pos-table { width:100%; border-collapse:collapse; }
  .pos-table tr { border-bottom:1px solid #f1f5f9; }
  .pos-table tr:last-child { border-bottom:none; }
  .pos-dept { padding:5px 8px 5px 0; font-size:8pt; font-weight:500; white-space:nowrap; width:170px; }
  .pos-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .pos-bar-cell { padding:5px 10px; }
  .pos-bar-track { height:7px; background:#f1f5f9; border-radius:4px; overflow:hidden; }
  .pos-bar-fill { height:100%; border-radius:4px; }
  .pos-badge-cell { text-align:right; width:72px; }
  .pos-badge { font-size:6.5pt; font-weight:600; padding:2px 7px; border-radius:10px; white-space:nowrap; }

  /* ── AGENTEN-KARTEN ── */
  .agent-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .agent-card { border-radius:6px; overflow:hidden; border:1px solid #e2e8f0; }
  .agent-header { padding:5px 10px; }
  .agent-name { font-size:7.5pt; font-weight:700; color:white; text-transform:uppercase; letter-spacing:.07em; }
  .agent-body { padding:8px 10px; font-size:8pt; color:#374151; line-height:1.5; }

  /* ── ENTSCHEIDUNG ── */
  .decision-row {
    display:flex; align-items:flex-start; gap:14px; margin-bottom:10px;
  }
  .decision-badge {
    font-size:10pt; font-weight:800; padding:5px 16px; border-radius:6px;
    color:white; letter-spacing:.04em; white-space:nowrap; flex-shrink:0; margin-top:1px;
  }
  .decision-text { font-size:9pt; color:#0f172a; line-height:1.6; }
  .reasoning-box {
    background:#f8fafc; border:1px solid #e2e8f0; border-radius:5px;
    padding:10px 12px; font-size:8pt; color:#475569; line-height:1.5; margin-bottom:8px;
  }
  .risk-row {
    display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;
  }
  .risk-box {
    background:#fef2f2; border:1px solid #fca5a5; border-radius:5px; padding:8px 10px;
  }
  .risk-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#dc2626; margin-bottom:3px; }
  .risk-text { font-size:8pt; color:#7f1d1d; }
  .mitigation-box { background:#f0fdf4; border:1px solid #86efac; border-radius:5px; padding:8px 10px; }
  .mitigation-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#16a34a; margin-bottom:3px; }
  .mitigation-text { font-size:8pt; color:#14532d; }

  /* ── ACTION ITEMS ── */
  .ai-table { width:100%; border-collapse:collapse; }
  .ai-table thead th { font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#64748b; padding:0 6px 6px; border-bottom:1.5px solid #e2e8f0; text-align:left; }
  .ai-table tbody tr { border-bottom:1px solid #f1f5f9; }
  .ai-table tbody tr:last-child { border-bottom:none; }
  .ai-num { font-size:8pt; font-weight:700; color:#94a3b8; padding:6px 6px; text-align:center; }
  .ai-owner { font-size:7.5pt; font-weight:600; color:#334155; padding:6px; white-space:nowrap; }
  .ai-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px; vertical-align:middle; }
  .ai-action { font-size:8.5pt; color:#1e293b; padding:6px; line-height:1.4; }
  .ai-due { font-size:7.5pt; font-weight:600; color:#6366f1; padding:6px; text-align:center; white-space:nowrap; }

  /* ── FOOTER ── */
  .footer {
    margin: 24px 48px 0;
    padding: 10px 0 20px;
    border-top: 1px solid #e2e8f0;
    display:flex; justify-content:space-between; align-items:flex-start;
    font-size:6.5pt; color:#94a3b8;
  }
  .footer-left { display:flex; flex-direction:column; gap:2px; }
  .footer-disclaimer { font-style:italic; color:#94a3b8; }

  /* ── PAGE BREAK ── */
  .page-break { page-break-before: always; padding-top:20px; }
</style>
</head>
<body>

<!-- ══ PROTOKOLL-KOPF ══ -->
<div class="proto-head">
  <div class="proto-label">Company OS — Deliberationsprotokoll</div>
  <div class="proto-topic">${topic}</div>
  <div class="proto-meta">
    <div class="proto-meta-item">
      <span class="proto-meta-label">Datum</span>
      <span class="proto-meta-val">${date}, ${time} Uhr</span>
    </div>
    <div class="proto-meta-item">
      <span class="proto-meta-label">Agenten</span>
      <span class="proto-meta-val">${agentCount} Abteilungen + CEO (Thomas)</span>
    </div>
    <div class="proto-meta-item">
      <span class="proto-meta-label">Phasen</span>
      <span class="proto-meta-val">Erstanalyse → Deliberation → CEO-Entscheidung</span>
    </div>
    ${decisionVerb ? `
    <div class="proto-meta-item">
      <span class="proto-meta-label">Entscheidung</span>
      <span class="proto-meta-val" style="color:${decisionBadgeColor}">${decisionVerb}</span>
    </div>` : ''}
  </div>
</div>

<!-- ══ 1 · KONTEXT ══ -->
${globalCtx ? `
<div class="section" style="padding-top:20px">
  <div class="section-header">
    <div class="section-num">1</div>
    <div class="section-title">Unternehmenskontext</div>
  </div>
  <div class="ctx-box">${globalCtx.replace(/\n/g,'<br>')}</div>
</div>` : ''}

<!-- ══ 2 · SWOT ══ -->
${renderSwot()}

<!-- ══ 3 · POSITIONSMATRIX ══ -->
${renderPositionMatrix()}

<!-- ══ 4 · ERSTANALYSEN ══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">4</div>
    <div class="section-title">Erstanalysen</div>
    <div class="section-sub">Phase 1 — parallel</div>
  </div>
  <div class="agent-grid">
    ${renderAgentCards(phase1)}
  </div>
</div>

<!-- ══ 5 · DELIBERATION ══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">5</div>
    <div class="section-title">Deliberation</div>
    <div class="section-sub">Phase 2 — Reaktion &amp; Widerspruch</div>
  </div>
  <div class="agent-grid">
    ${renderAgentCards(phase2)}
  </div>
</div>

<!-- ══ 6 · ENTSCHEIDUNG ══ -->
<div class="section" style="margin-top:16px">
  <div class="section-header">
    <div class="section-num">6</div>
    <div class="section-title">CEO-Entscheidung</div>
    <div class="section-sub">Thomas, CEO</div>
  </div>

  ${decisionVerb ? `
  <div class="decision-row">
    <div class="decision-badge" style="background:${decisionBadgeColor}">${decisionVerb}</div>
    <div class="decision-text">${(ceoResult.decision_text ?? '').replace(/\n/g,'<br>')}</div>
  </div>` : ''}

  ${ceoResult.reasoning ? `
  <div class="reasoning-box">
    <strong style="font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:#64748b;display:block;margin-bottom:4px">Begründung</strong>
    ${ceoResult.reasoning.replace(/\n/g,'<br>')}
  </div>` : ''}

  ${(ceoResult.main_risk || ceoResult.risk_mitigation) ? `
  <div class="risk-row">
    ${ceoResult.main_risk ? `
    <div class="risk-box">
      <div class="risk-label">Hauptrisiko</div>
      <div class="risk-text">${ceoResult.main_risk}</div>
    </div>` : ''}
    ${ceoResult.risk_mitigation ? `
    <div class="mitigation-box">
      <div class="mitigation-label">Gegenmassnahme</div>
      <div class="mitigation-text">${ceoResult.risk_mitigation}</div>
    </div>` : ''}
  </div>` : ''}
</div>

<!-- ══ 7 · HANDLUNGSEMPFEHLUNGEN ══ -->
${actionItems.length ? `
<div class="section" style="margin-top:16px">
  <div class="section-header">
    <div class="section-num">7</div>
    <div class="section-title">Handlungsempfehlungen</div>
    <div class="section-sub">Priorisiert — umzusetzen bis zur genannten Frist</div>
  </div>
  ${renderActionItems()}
</div>` : ''}

<!-- ══ FOOTER ══ -->
<div class="footer">
  <div class="footer-left">
    <span>Company OS — autonomes Multi-Agent-Deliberationssystem</span>
    <span class="footer-disclaimer">Ohne Gewähr auf Richtigkeit. Dieses Protokoll wurde vollständig durch KI-Agenten erstellt und ersetzt keine professionelle Beratung.</span>
  </div>
  <span>${date}</span>
</div>

</body>
</html>`;
}

// ── PDF-EXPORT ──────────────────────────────────────────

async function generatePDF(data, outputDir) {
  const html      = buildHTML(data);
  const htmlPath  = path.join(os.tmpdir(), `company-os-protocol-${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const reportsDir = outputDir || path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const slug     = data.topic.slice(0, 40).replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '-').replace(/-+/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  const pdfPath  = path.join(reportsDir, `${datePart}-${slug}.pdf`);

  try {
    const puppeteer = require('puppeteer');
    const browser   = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({
      path:            pdfPath,
      format:          'A4',
      margin:          { top: '0', right: '0', bottom: '15mm', left: '0' },
      printBackground: true,
    });
    await browser.close();
    fs.unlinkSync(htmlPath);
    openFile(pdfPath);
    return pdfPath;

  } catch (err) {
    console.log('\n[PDF] Puppeteer nicht verfügbar — HTML-Version wird geöffnet.');
    openFile(htmlPath);
    return htmlPath;
  }
}

function openFile(filePath) {
  const platform = os.platform();
  try {
    if (platform === 'darwin')      execSync(`open "${filePath}"`);
    else if (platform === 'linux')  execSync(`xdg-open "${filePath}" 2>/dev/null || true`);
    else if (platform === 'win32')  execSync(`start "" "${filePath}"`);
  } catch {}
}

module.exports = { generatePDF };
