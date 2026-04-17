// src/agents/index.js
// Agenten-Registry — statische Kern-Agenten + dynamisch vom CEO erstellte

const BaseAgent = require('./base');

// ── KERN-AGENTEN (immer aktiv) ─────────────────────────

const CORE_AGENTS = [
  {
    id: 'strategy',
    name: 'Strategie',
    systemPrompt: `Du bist der Chief Strategy Officer. Marktpositionierung, Wettbewerbsanalyse, OKRs, strategische Prioritaeten. Du denkst in 6-18 Monaten. Direkt, sachlich, keine Floskeln. Deutsch.`,
  },
  {
    id: 'finance',
    name: 'Finanzen',
    systemPrompt: `Du bist der CFO. P&L, Budgetplanung, Cashflow, ROI-Analysen, Finanzrisiken. Zahlenorientiert, konservativ, konkret. Deutsch.`,
  },
  {
    id: 'marketing',
    name: 'Marketing',
    systemPrompt: `Du bist der CMO. Positionierung, Content-Strategie, Kampagnen, Zielgruppen, Kanalauswahl. Kreativ aber messbar. Deutsch.`,
  },
  {
    id: 'sales',
    name: 'Sales',
    systemPrompt: `Du bist der VP Sales. Pipeline, Zielkunden, Pricing, Abschlussquoten. Direkt, umsetzbar, in ARR denken. Deutsch.`,
  },
  {
    id: 'hr',
    name: 'HR',
    systemPrompt: `Du bist der CPO. Recruiting, Kultur, Kapazitaet, Leistungsentwicklung. Menschenzentriert, praktisch. Deutsch.`,
  },
  {
    id: 'rd',
    name: 'F&E',
    systemPrompt: `Du bist der CTO. Produktentwicklung, Architektur, Tech-Debt, Zeitplanung. Praezise, technisch fundiert. Deutsch.`,
  },
  {
    id: 'legal',
    name: 'Legal',
    systemPrompt: `Du bist General Counsel. Vertragsrecht, DSGVO, Regulatorik, Haftung. Risikobasiert, klar. Kein Rechtsanwaltsersatz. Deutsch.`,
  },
  {
    id: 'ops',
    name: 'Operations',
    systemPrompt: `Du bist der COO. Prozessoptimierung, Qualitaet, Skalierung, operative KPIs. Prozessorientiert, messbar. Deutsch.`,
  },
];

// ── REGISTRY AUFBAUEN ──────────────────────────────────

function buildRegistry() {
  const registry = {};

  // 1. Kern-Agenten laden
  CORE_AGENTS.forEach(def => {
    registry[def.id] = new BaseAgent(def);
  });

  // 2. Dynamische Agenten aus DB laden
  try {
    const db = require('../db');
    const dynamic = db.getDynamicAgents();
    dynamic.forEach(row => {
      if (!registry[row.id]) {
        registry[row.id] = new BaseAgent({
          id: row.id,
          name: row.name,
          systemPrompt: row.system_prompt,
        });
      }
    });
    if (dynamic.length > 0) {
      const log = require('../utils/log');
      log.info(`[Agents] ${dynamic.length} dynamische Agenten geladen: ${dynamic.map(d => d.name).join(', ')}`);
    }
  } catch (err) {
    // DB noch nicht initialisiert — kein Problem beim ersten Start
  }

  return registry;
}

let _registry = null;

function getRegistry() {
  if (!_registry) _registry = buildRegistry();
  return _registry;
}

// Dynamisch hinzufügen ohne Neustart
function addDynamicAgent(def) {
  const reg = getRegistry();
  if (!reg[def.id]) {
    reg[def.id] = new BaseAgent(def);
    try {
      const db = require('../db');
      db.createDynamicAgent(def);
    } catch {}
  }
  return reg[def.id];
}

// Registry neu laden (nach CEO-Erstellung)
function reload() {
  _registry = null;
  return getRegistry();
}

module.exports = {
  list: () => Object.values(getRegistry()),
  get: (id) => getRegistry()[id],
  ids: () => Object.keys(getRegistry()),
  addDynamicAgent,
  reload,
  getCoreIds: () => CORE_AGENTS.map(a => a.id),
};
