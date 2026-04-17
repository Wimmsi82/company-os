// src/agents/index.js
// Agenten-Registry — Kern-Agenten mit Spezialistenprompots + dynamische + Consultants

const BaseAgent = require('./base');
const SPECIALIST_PROMPTS = require('./specialists');
const { getConsultantAsAgent, listConsultants } = require('./consultants');

// ── KERN-AGENTEN ───────────────────────────────────────

const CORE_AGENTS = [
  { id: 'strategy',  name: 'Strategie'  },
  { id: 'finance',   name: 'Finanzen'   },
  { id: 'marketing', name: 'Marketing'  },
  { id: 'sales',     name: 'Sales'      },
  { id: 'hr',        name: 'HR'         },
  { id: 'rd',        name: 'F&E'        },
  { id: 'legal',     name: 'Legal'      },
  { id: 'ops',       name: 'Operations' },
];

// ── REGISTRY AUFBAUEN ──────────────────────────────────

function buildRegistry() {
  const registry = {};

  // 1. Kern-Agenten mit Spezialistenprompots
  CORE_AGENTS.forEach(def => {
    registry[def.id] = new BaseAgent({
      id: def.id,
      name: def.name,
      systemPrompt: SPECIALIST_PROMPTS[def.id],
    });
  });

  // 2. Dynamische Agenten aus DB
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
      log.info(`[Agents] ${dynamic.length} dynamische Agenten: ${dynamic.map(d => d.name).join(', ')}`);
    }
  } catch {}

  return registry;
}

let _registry = null;

function getRegistry() {
  if (!_registry) _registry = buildRegistry();
  return _registry;
}

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

  // Consultant-Zugang
  getConsultant: getConsultantAsAgent,
  listConsultants,
};
