// src/scheduler/negotiation.js
// Verhandlungsrunde zwischen Agenten — laeuft zwischen Phase 2 und CEO
// Definiert Paare die strukturiert miteinander verhandeln

const log = require('../utils/log');

// Verhandlungspaare: wer verhandelt mit wem ueber welches Thema
const NEGOTIATION_PAIRS = [
  {
    a: 'sales',
    b: 'legal',
    topic: 'Vertragskonditionen und Risiken',
    description: 'Sales will schnelle Abschluesse, Legal will Absicherung',
  },
  {
    a: 'marketing',
    b: 'finance',
    topic: 'Marketingbudget und ROI',
    description: 'Marketing will investieren, Finanzen wollen ROI-Nachweis',
  },
  {
    a: 'rd',
    b: 'ops',
    topic: 'Technische Implementierung vs. operative Stabilitaet',
    description: 'F&E will Neues bauen, Ops will Stabilitaet sichern',
  },
  {
    a: 'strategy',
    b: 'finance',
    topic: 'Wachstum vs. Kosteneffizienz',
    description: 'Strategie will expandieren, Finanzen wollen konservativ bleiben',
  },
];

const MAX_ROUNDS = 2; // Verhandlungsrunden pro Paar

async function runNegotiations(topic, phase1Results, agentRegistry) {
  log.info('[Negotiation] Verhandlungsrunde startet ...');
  const results = {};

  for (const pair of NEGOTIATION_PAIRS) {
    const agentA = agentRegistry.get(pair.a);
    const agentB = agentRegistry.get(pair.b);

    // Nur verhandeln wenn beide Agenten existieren und Analysen haben
    if (!agentA || !agentB) continue;
    if (!phase1Results[pair.a] || !phase1Results[pair.b]) continue;

    log.info(`[Negotiation] ${agentA.name} <> ${agentB.name}: ${pair.topic}`);

    const pairKey = `${pair.a}_vs_${pair.b}`;
    results[pairKey] = {
      topic: pair.topic,
      description: pair.description,
      rounds: [],
      conclusion: '',
    };

    let positionA = phase1Results[pair.a];
    let positionB = phase1Results[pair.b];

    // Verhandlungsrunden
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      try {
        // A antwortet auf B
        const responseA = await agentA.negotiate(
          `${topic} — ${pair.topic}`,
          pair.b, agentB.name, positionB, round
        );

        // B antwortet auf A
        const responseB = await agentB.negotiate(
          `${topic} — ${pair.topic}`,
          pair.a, agentA.name, responseA, round
        );

        results[pairKey].rounds.push({
          round,
          [pair.a]: responseA,
          [pair.b]: responseB,
        });

        positionA = responseA;
        positionB = responseB;

        log.info(`[Negotiation] Runde ${round} abgeschlossen: ${agentA.name} <> ${agentB.name}`);

      } catch (err) {
        log.error(`[Negotiation] Fehler in Runde ${round}: ${err.message}`);
        break;
      }
    }

    // Fazit: letzter Stand beider Positionen
    results[pairKey].conclusion = `${agentA.name}: ${positionA}\n\n${agentB.name}: ${positionB}`;
  }

  log.info(`[Negotiation] ${Object.keys(results).length} Verhandlungen abgeschlossen`);
  return results;
}

// Verhandlungsergebnisse als lesbaren Kontext formatieren
function formatNegotiations(negotiations) {
  if (!Object.keys(negotiations).length) return '';
  const lines = ['\n=== VERHANDLUNGSERGEBNISSE ==='];
  Object.entries(negotiations).forEach(([key, n]) => {
    lines.push(`\n[${n.topic}]`);
    lines.push(n.conclusion);
  });
  return lines.join('\n');
}

module.exports = { runNegotiations, formatNegotiations };
