#!/usr/bin/env node
// run.js v3 — Company OS Hauptscript
// Verwendung: node run.js "Aufgabe"
//             node run.js --onboarding
//             node run.js --set-context "key=value"
//             node run.js --context
//             node run.js --performance
//             node run.js --no-pdf "Aufgabe"   (PDF deaktivieren)

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

// DB initialisieren
const dbPath = path.join(__dirname, 'db/company-os.sqlite');
if (!fs.existsSync(dbPath)) {
  execSync('node src/db/migrate.js', { cwd: __dirname, stdio: 'inherit' });
}

const db = require('./src/db');
const { generatePDF } = require('./src/pdf');
const { runNegotiations, formatNegotiations } = require('./src/scheduler/negotiation');
const { runIterativeLoop, MAX_ROUNDS } = require('./src/scheduler/loop');
const { listConsultants, getConsultant } = require('./src/agents/consultants');
const { runMetaEvaluation, getPerformanceReport } = require('./src/agents/meta');

const MODE = process.env.CLAUDE_MODE ?? 'cli';

// ── CLAUDE WRAPPER ─────────────────────────────────────

function callClaude(system, userMessage) {
  if (MODE === 'api') {
    const script = `
      require('dotenv').config();
      const Anthropic = require('@anthropic-ai/sdk');
      const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      c.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: ${JSON.stringify(system)},
        messages: [{ role: 'user', content: ${JSON.stringify(userMessage)} }]
      }).then(r => process.stdout.write(r.content[0].text)).catch(e => process.stderr.write(e.message));
    `;
    const tmpJs = path.join(os.tmpdir(), `cos-api-${Date.now()}.js`);
    fs.writeFileSync(tmpJs, script);
    try {
      return execSync(`node ${tmpJs}`, { encoding: 'utf8', timeout: 60000, cwd: __dirname }).trim() || 'Keine Antwort.';
    } catch (err) {
      return err.stdout?.trim() || `Fehler: ${err.message.slice(0, 100)}`;
    } finally {
      try { fs.unlinkSync(tmpJs); } catch {}
    }
  }

  // CLI-Modus — stdin pipe (funktioniert mit Claude Code Max-Plan)
  const cliInput = system + '\n\n---\n\n' + userMessage;
  try {
    return execSync(
      'claude -p --output-format text',
      { encoding: 'utf8', timeout: 120000, input: cliInput, cwd: __dirname }
    ).trim() || 'Keine Antwort.';
  } catch (err) {
    return err.stdout?.trim() || `Fehler: ${err.message.slice(0, 100)}`;
  }
}

// ── AGENTEN ────────────────────────────────────────────

const AGENTS = [
  { id: 'strategy',  name: 'Strategie',  prompt: 'Du bist der Chief Strategy Officer. Liefere eine praezise strategische Einschaetzung in 3-4 Saetzen. Nutze den Unternehmenskontext. Deutsch.' },
  { id: 'finance',   name: 'Finanzen',   prompt: 'Du bist der CFO. Liefere eine praezise Finanzeinschaetzung in 3-4 Saetzen. Fokus: ROI, Risiken, Cashflow. Deutsch.' },
  { id: 'marketing', name: 'Marketing',  prompt: 'Du bist der CMO. Liefere eine praezise Marketing-Einschaetzung in 3-4 Saetzen. Fokus: Positionierung, Zielgruppen. Deutsch.' },
  { id: 'sales',     name: 'Sales',      prompt: 'Du bist der VP Sales. Liefere eine praezise Sales-Einschaetzung in 3-4 Saetzen. Fokus: Pipeline, Abschluesse. Deutsch.' },
  { id: 'hr',        name: 'HR',         prompt: 'Du bist der CPO. Liefere eine praezise People-Einschaetzung in 3-4 Saetzen. Fokus: Kapazitaet, Kultur. Deutsch.' },
  { id: 'rd',        name: 'F&E',        prompt: 'Du bist der CTO. Liefere eine praezise Tech-Einschaetzung in 3-4 Saetzen. Fokus: Machbarkeit, Zeitplan. Deutsch.' },
  { id: 'legal',     name: 'Legal',      prompt: 'Du bist General Counsel. Liefere eine praezise Rechtseinschaetzung in 3-4 Saetzen. Kein Rechtsanwaltsersatz. Deutsch.' },
  { id: 'ops',       name: 'Operations', prompt: 'Du bist der COO. Liefere eine praezise Ops-Einschaetzung in 3-4 Saetzen. Fokus: Prozesse, Skalierung. Deutsch.' },
];

// Dynamische Agenten aus DB laden (vom CEO erstellt)
function getActiveAgents(consultantIds = []) {
  const active = AGENTS.map(a => ({
    id: a.id,
    name: a.name,
    // Spezialistenprompots aus specialists.js laden
    prompt: (() => { try { return require('./src/agents/specialists')[a.id] || a.prompt; } catch { return a.prompt; } })(),
  }));
  try {
    const dynamic = db.getDynamicAgents();
    dynamic.forEach(row => {
      if (!active.find(a => a.id === row.id)) {
        active.push({ id: row.id, name: row.name, prompt: row.system_prompt });
      }
    });
  } catch {}
  // Consultants hinzufuegen wenn angegeben
  consultantIds.forEach(cId => {
    const c = getConsultant(cId);
    if (c && !active.find(a => a.id === c.id)) {
      active.push({ id: c.id, name: c.shortName, prompt: c.systemPrompt });
    }
  });
  return active;
}

// ── KONTEXT ────────────────────────────────────────────

function buildGlobalContext() {
  try {
    const global = db.getGlobalMemory().filter(g => !g.value.includes('['));
    if (!global.length) return '';
    return global.map(g => `${g.key}: ${g.value}`).join('\n');
  } catch { return ''; }
}

function buildGlobalContextPrompt() {
  const ctx = buildGlobalContext();
  return ctx ? '\n\nUnternehmenskontext:\n' + ctx : '';
}

// ── ONBOARDING ─────────────────────────────────────────

async function runOnboarding() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));
  const SEP = '─'.repeat(60);

  console.log('\n' + SEP);
  console.log('  COMPANY OS — Ersteinrichtung');
  console.log(`  Modus: ${MODE.toUpperCase()}`);
  console.log(SEP);
  console.log('\nIch stelle 5 kurze Fragen. Deine Antworten werden als');
  console.log('globaler Kontext gespeichert — alle Agenten nutzen ihn.\n');

  const questions = [
    { key: 'company_context',  label: '1. Unternehmen / Branche / Produkt', hint: 'z.B. SaaS fuer Immobilien-Makler in Oesterreich' },
    { key: 'active_projects',  label: '2. Aktive Projekte',                 hint: 'z.B. MVP-Launch Q3, Fundraising, DACH-Expansion' },
    { key: 'current_goals',    label: '3. Aktuelle Ziele / OKRs',           hint: 'z.B. 10 zahlende Kunden bis Juni, Break-even Q4' },
    { key: 'key_constraints',  label: '4. Wichtigste Constraints',          hint: 'z.B. 2 Personen, Budget 5k/Monat, kein Dev-Team' },
    { key: 'competitors',      label: '5. Hauptwettbewerber',               hint: 'z.B. PropTech X, Startup Y, traditionelle Makler' },
  ];

  for (const q of questions) {
    console.log(`\n${q.label}`);
    console.log(`  Beispiel: ${q.hint}`);
    const answer = await ask('  > ');
    if (answer.trim()) {
      db.upsertGlobalMemory(q.key, answer.trim(), 'operator');
      console.log('  ✓ Gespeichert');
    } else {
      console.log('  — Uebersprungen');
    }
  }
  rl.close();

  console.log('\n' + SEP);
  console.log('  Onboarding abgeschlossen.\n');
  const saved = db.getGlobalMemory().filter(g => !g.value.includes('['));
  saved.forEach(g => console.log(`  ${g.key}: ${g.value.slice(0, 70)}${g.value.length > 70 ? '...' : ''}`));
  console.log(`\nNaechster Schritt:\n  node run.js "Deine erste Frage ans Team"\n`);
}

// ── DELIBERATION ───────────────────────────────────────

async function runDeliberation(topic, skipPdf = false, consultantIds = []) {
  const cycleId = db.createCycle('manual', topic);
  const globalCtxPrompt = buildGlobalContextPrompt();
  const globalCtxText = buildGlobalContext();
  const SEP = '─'.repeat(60);

  console.log('\n' + SEP);
  console.log('  COMPANY OS');
  console.log(`  Modus: ${MODE.toUpperCase()}`);
  console.log(`  Thema: "${topic}"`);
  if (globalCtxText) console.log('  Kontext: aktiv');
  if (consultantIds.length) console.log(`  Consultants: ${consultantIds.join(', ')}`);
  console.log(SEP + '\n');

  // Iterativer Loop: ersetzt Phase 1 + Phase 2
  console.log(`\n\u25B6 Iterativer Deliberations-Loop (max ${MAX_ROUNDS} Runden)\n`);

  const loopResult = await runIterativeLoop({
    topic,
    agents: getActiveAgents(consultantIds),
    globalCtx: globalCtxPrompt,
    callClaude,
    onRoundComplete: async (round, results, agents) => {
      console.log('\n' + SEP);
      console.log(`\n  RUNDE ${round}\n`);
      agents.forEach(a => {
        if (results[a.id]) {
          console.log(`[${a.name.toUpperCase()}]`);
          console.log(results[a.id]);
          console.log('');
          try {
            db.upsertMemory(a.id, 'last_topic', topic, { confidence: 0.9 });
            db.upsertMemory(a.id, `round_${round}`, results[a.id].split('.')[0].slice(0, 200), { confidence: 0.7 });
          } catch {}
        }
      });
    }
  });

  const phase1 = loopResult.rounds[0] ?? {};
  const phase2 = loopResult.finalRound ?? {};

  if (loopResult.converged) {
    console.log('\n' + SEP);
    console.log(`\n  Konvergenz nach ${loopResult.totalRounds} Runden erreicht.`);
  }

  if (Object.keys(loopResult.sharedKnowledge).length) {
    console.log('\n  Geteiltes Wissen:');
    Object.entries(loopResult.sharedKnowledge).forEach(([k, v]) => {
      console.log(`    ${k}: ${v.slice(0, 100)}`);
    });
  }

  // Phase 2b — Verhandlungsrunden zwischen Agenten
  console.log('\n' + SEP);
  console.log('\n▶ Phase 2b — Verhandlung\n');

  // Agenten-Objekte fuer Verhandlung (CLI-Modus: vereinfacht)
  const negotiationAgentRegistry = {
    get: (id) => {
      const a = getActiveAgents().find(ag => ag.id === id);
      if (!a) return null;
      return {
        id: a.id, name: a.name,
        negotiate: async (topic, counterpartId, counterpartName, counterpartPos, round) => {
          process.stdout.write(`  [${a.name.padEnd(10)} <> ${counterpartName.padEnd(10)}] Runde ${round} ... `);
          const result = callClaude(
            a.prompt,
            `Verhandlungsthema: ${topic}\n\nGegenposition von ${counterpartName}:\n${counterpartPos}\n\nRunde ${round}: Reagiere sachlich, verteidige deinen Standpunkt, mache Zugestaendnisse wo sinnvoll. 2-3 Saetze.`
          );
          console.log('✓');
          return result;
        }
      };
    }
  };

  let negotiations = {};
  try {
    negotiations = await runNegotiations(topic, phase1, negotiationAgentRegistry);
    const negPairs = Object.keys(negotiations);
    if (negPairs.length) {
      console.log('\n' + SEP);
      negPairs.forEach(key => {
        const n = negotiations[key];
        console.log(`\n[VERHANDLUNG: ${n.topic.toUpperCase()}]`);
        if (n.rounds.length) {
          const lastRound = n.rounds[n.rounds.length - 1];
          Object.entries(lastRound).forEach(([k, v]) => {
            if (k !== 'round') console.log(`  ${k}: ${v}`);
          });
        }
      });
    }
  } catch (err) {
    console.log('  (Verhandlung uebersprungen: ' + err.message.slice(0, 50) + ')');
  }

  // Phase 3 — CEO mit Gap-Detection
  console.log('\n' + SEP);
  console.log('\n▶ Phase 3 — CEO-Synthese + Gap-Detection\n');
  process.stdout.write('  [CEO          ] ');

  const activeAgents = getActiveAgents();
  const allP1 = activeAgents.filter(a => phase1[a.id]).map(a => `[${a.name}]: ${phase1[a.id]}`).join('\n\n');
  const allP2 = activeAgents.filter(a => phase2[a.id]).map(a => `[${a.name}]: ${phase2[a.id]}`).join('\n\n');
  const existingIds = activeAgents.map(a => a.id).join(', ');

  const ceoPrompt = `Du bist der CEO. Analysiere die Deliberation und formuliere eine Entscheidung. Erkenne auch ob eine wichtige Perspektive gefehlt hat.

Aktive Abteilungen: ${existingIds}

Antworte im JSON-Format:
{
  "decision": "ja|nein|bedingt",
  "decision_text": "klare Formulierung",
  "reasoning": "Begruendung",
  "action_items": [{"owner": "abteilung", "action": "Aufgabe", "deadline_days": 7}],
  "main_risk": "Hauptrisiko",
  "risk_mitigation": "Gegenmassnahme",
  "missing_perspectives": [
    {
      "id": "slug_ohne_leerzeichen",
      "name": "Abteilungsname",
      "reason": "warum diese Perspektive gefehlt hat",
      "system_prompt": "Du bist [Rolle]. Deine Aufgaben: [konkret]. Direkt, praezise. Deutsch."
    }
  ]
}
Nur bei echten Luecken neue Agenten vorschlagen. Max 2. missing_perspectives = [] wenn nichts fehlt. Nur JSON.`;

  const negCtx = formatNegotiations(negotiations);
  const rawDecision = callClaude(
    ceoPrompt,
    `Aufgabe: ${topic}${globalCtxPrompt}\n\n=== ERSTANALYSEN ===\n${allP1}\n\n=== DELIBERATION ===\n${allP2}${negCtx}`
  );
  console.log('✓');

  // CEO-Response parsen
  let ceoResult = {};
  let decisionText = rawDecision;
  const newDynamicAgents = [];

  try {
    const clean = rawDecision.replace(/\`\`\`json|\`\`\`/g, '').trim();
    ceoResult = JSON.parse(clean);
    decisionText = [
      `Entscheidung: ${ceoResult.decision?.toUpperCase()} — ${ceoResult.decision_text}`,
      ``,
      `Begruendung: ${ceoResult.reasoning}`,
      ``,
      `Massnahmen:`,
      ...(ceoResult.action_items ?? []).map((a, i) => `  ${i+1}. [${a.owner}] ${a.action} (${a.deadline_days}d)`),
      ``,
      `Hauptrisiko: ${ceoResult.main_risk}`,
      `Gegenmassnahme: ${ceoResult.risk_mitigation}`,
    ].join('\n');

    // Dynamische Agenten erstellen
    (ceoResult.missing_perspectives ?? []).forEach(agent => {
      if (!agent.id || !agent.name || !agent.system_prompt) return;
      const safeId = agent.id.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      try {
        db.createDynamicAgent({
          id: safeId,
          name: agent.name,
          systemPrompt: agent.system_prompt,
          createdBy: 'ceo',
          context: `Erstellt fuer: ${topic} — ${agent.reason}`,
        });
        newDynamicAgents.push({ id: safeId, name: agent.name, reason: agent.reason });
      } catch (e) {
        // Agent existiert bereits
      }
    });
  } catch {
    // Kein JSON — Rohtext verwenden
  }

  try {
    db.createTask({
      from_dept: 'ceo', to_dept: 'all', type: 'decision', priority: 1,
      title: `CEO: ${topic.slice(0, 80)}`, body: decisionText, cycle_id: cycleId,
    });
    db.updateCycle(cycleId, 'done', { phase1, phase2, decision: decisionText }, 0);
  } catch {}

  console.log('\n' + SEP);
  console.log('\n  CEO-ENTSCHEIDUNG\n');
  console.log(decisionText);

  if (newDynamicAgents.length > 0) {
    console.log('\n' + SEP);
    console.log('\n  NEUE ABTEILUNGEN ERKANNT\n');
    newDynamicAgents.forEach(a => {
      console.log(`  + ${a.name} (${a.id})`);
      console.log(`    Grund: ${a.reason}`);
    });
    console.log('\n  Beim naechsten Lauf sind diese Agenten aktiv.');
  }

  console.log('\n' + SEP);
  console.log(`\nZyklus: ${cycleId}`);
  const decision = decisionText;

  // Meta-Evaluation: Agenten bewerten und verbessern
  const runMeta = process.env.META_EVALUATION !== 'false';
  if (runMeta) {
    console.log('\n▶ Meta-Evaluation ...');
    try {
      const metaAgentRegistry = {
        list: () => getActiveAgents().map(a => ({
          id: a.id, name: a.name, systemPrompt: a.prompt,
          updateSystemPrompt: (newPrompt) => {
            a.prompt = newPrompt;
            try { db.updateAgentPrompt(a.id, newPrompt); } catch {}
            console.log(`  [Meta] Prompt verbessert: ${a.name}`);
          }
        }))
      };
      const { improvements } = await runMetaEvaluation({
        topic, phase1, phase2, negotiations, agentRegistry: metaAgentRegistry
      });
      if (improvements.length) {
        console.log(`  ✓ ${improvements.length} Agent-Prompt(s) verbessert:`);
        improvements.forEach(i => console.log(`    ${i.agent} (Score war ${i.oldScore}/10)`));
      } else {
        console.log('  ✓ Alle Agenten gut bewertet — keine Aenderungen');
      }
    } catch (err) {
      console.log('  (Meta-Evaluation uebersprungen: ' + err.message.slice(0, 50) + ')');
    }
  }

  // PDF generieren
  if (!skipPdf) {
    console.log('\n▶ PDF wird erstellt …');
    try {
      const pdfPath = await generatePDF({
        topic,
        phase1,
        phase2,
        decision,
        timestamp: new Date().toISOString(),
        globalCtx: globalCtxText,
      });
      console.log(`  ✓ PDF: ${pdfPath}`);
      console.log('  (wird automatisch geoeffnet)');
    } catch (err) {
      console.log(`  PDF-Fehler: ${err.message}`);
      console.log('  Tipp: npm install (fuer Puppeteer)');
    }
  }

  console.log('');
}

// ── CLI ROUTER ─────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const skipPdf = rawArgs.includes('--no-pdf');
const args = rawArgs.filter(a => a !== '--no-pdf');

if (args[0] === '--onboarding') {
  runOnboarding().catch(console.error);

} else if (args[0] === '--set-context') {
  const raw = args.slice(1).join(' ');
  const sep = raw.indexOf('=');
  if (sep === -1) { console.error('Format: --set-context "key=value"'); process.exit(1); }
  db.upsertGlobalMemory(raw.slice(0, sep).trim(), raw.slice(sep + 1).trim(), 'operator');
  console.log(`✓ Gespeichert: ${raw.slice(0, sep).trim()}`);

} else if (args[0] === '--context') {
  const global = db.getGlobalMemory();
  console.log('\n── Globaler Kontext ──');
  global.forEach(g => { console.log(`\n[${g.key}]`); console.log(g.value); });
  console.log('');

} else if (args[0] === '--performance') {
  const perf = db.getAgentPerformance();
  const metaScores = getPerformanceReport();
  console.log('\n── Agent Performance ──');
  if (metaScores.length) {
    console.log('Meta-Bewertungen:');
    metaScores.forEach(s => {
      const stars = '★'.repeat(Math.round(s.score)) + '☆'.repeat(10-Math.round(s.score));
      console.log(`  ${s.agent.padEnd(15)} ${stars} ${s.score}/10`);
    });
  }
  if (perf.length) {
    console.log('\nOutcome-Ratings:');
    perf.forEach(p => {
      const stars = '★'.repeat(Math.round(p.avg_rating||0)) + '☆'.repeat(5-Math.round(p.avg_rating||0));
      console.log(`  ${p.to_dept.padEnd(15)} ${stars} Ø${(p.avg_rating||0).toFixed(1)} (${p.total} Tasks)`);
    });
  }
  if (!metaScores.length && !perf.length) {
    console.log('Noch keine Bewertungen. Nach der ersten Deliberation verfuegbar.');
  }
  console.log('');

} else if (args[0] === '--list-consultants') {
  const list = listConsultants();
  console.log('\n── Verfuegbare Consultants ──');
  list.forEach(c => console.log(`  --consultant ${c.id.padEnd(15)} ${c.name}`));
  console.log('\nVerwendung: node run.js --consultant mckinsey "Frage"');
  console.log('');

} else if (args[0] === '--consultant') {
  // Format: node run.js --consultant mckinsey,ey "Frage"
  const cIds = args[1].split(',').map(s => s.trim());
  const topic = args.slice(2).join(' ');
  if (!topic) { console.error('Frage fehlt nach Consultant-Namen'); process.exit(1); }
  runDeliberation(topic, skipPdf, cIds).catch(console.error);

} else if (args.length > 0) {
  runDeliberation(args.join(' '), skipPdf).catch(console.error);

} else {
  console.log(`
Company OS — Autonomes Multi-Agent-System

Verwendung / Usage:
  node run.js --onboarding              Ersteinrichtung / Initial setup
  node run.js "Frage"                   Deliberation + PDF
  node run.js --no-pdf "Frage"          Deliberation ohne PDF
  node run.js --context                 Kontext anzeigen
  node run.js --set-context "key=val"   Kontext setzen
  node run.js --performance             Agent-Performance
  node run.js --list-consultants        Verfuegbare Consultants anzeigen
  node run.js --consultant mckinsey "Frage"  Mit McKinsey-Berater
  node run.js --consultant mckinsey,ey "Frage"  Mehrere Consultants

Modus (in .env):
  CLAUDE_MODE=cli   Claude Code CLI (kein API Key noetig)
  CLAUDE_MODE=api   Anthropic API   (ANTHROPIC_API_KEY erforderlich)
  `);
}
