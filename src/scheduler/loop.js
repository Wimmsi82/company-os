// src/scheduler/loop.js
// Iterativer Deliberations-Loop mit 360-Grad-Kontext und Agent-zu-Agent-Fragen

const log = require('../utils/log');

const MAX_ROUNDS = parseInt(process.env.MAX_LOOP_ROUNDS ?? '3');
const CONVERGENCE_THRESHOLD = 0.8; // 80% Uebereinstimmung = konvergiert

// ── AGENT-ZU-AGENT FRAGEN ──────────────────────────────
// Agent A stellt eine direkte Frage an Agent B und wartet auf Antwort

async function agentQuery(asker, target, question, callClaude) {
  log.info(`[Loop] ${asker.name} fragt ${target.name}: ${question.slice(0, 60)}`);
  const answer = callClaude(
    target.prompt,
    `${asker.name} stellt dir eine direkte Frage:\n\n"${question}"\n\nAntworte praezise in 2-3 Saetzen. Nur die Antwort, kein JSON.`
  );
  log.info(`[Loop] ${target.name} antwortet`);
  return answer;
}

// ── FRAGEN EXTRAKTION ──────────────────────────────────
// Aus einer Analyse extrahieren ob ein Agent eine Frage an einen anderen hat

function extractQueries(analysisText) {
  const queries = [];
  // Pattern: "Frage an [Abteilung]: [Frage]"
  const pattern = /Frage an ([A-Za-z&\s]+):\s*([^.!?]+[.!?])/gi;
  let match;
  while ((match = pattern.exec(analysisText)) !== null) {
    queries.push({
      target: match[1].trim().toLowerCase(),
      question: match[2].trim(),
    });
  }
  return queries;
}

// ── KONVERGENZ-CHECK ───────────────────────────────────
// Prüft ob sich die Positionen zwischen zwei Runden wesentlich geaendert haben

function checkConvergence(prevRound, currentRound) {
  const agentIds = Object.keys(currentRound);
  if (!agentIds.length || !Object.keys(prevRound).length) return false;

  let unchangedCount = 0;
  for (const id of agentIds) {
    const prev = prevRound[id] ?? '';
    const curr = currentRound[id] ?? '';
    // Grobe Aehlichkeit: erste 100 Zeichen vergleichen
    const similarity = prev.slice(0, 100) === curr.slice(0, 100) ? 1 : 0;
    unchangedCount += similarity;
  }

  const convergenceRatio = unchangedCount / agentIds.length;
  log.info(`[Loop] Konvergenz: ${(convergenceRatio * 100).toFixed(0)}%`);
  return convergenceRatio >= CONVERGENCE_THRESHOLD;
}

// ── HAUPTLOOP ─────────────────────────────────────────

async function runIterativeLoop({ topic, agents, globalCtx, callClaude, onRoundComplete }) {
  log.info(`[Loop] Iterativer Loop startet — max ${MAX_ROUNDS} Runden`);

  const allRounds = [];       // alle Runden gespeichert
  const sharedKnowledge = {}; // akkumuliertes Wissen aller Agenten
  let prevPositions = {};
  let ceoFeedback = '';
  let converged = false;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    log.info(`[Loop] Runde ${round}/${MAX_ROUNDS}`);
    const roundResults = {};

    // ── 360-Grad-Kontext aufbauen ──
    const prevRoundCtx = allRounds.length
      ? '\n\n=== VORHERIGE RUNDEN ===\n' + allRounds.map((r, i) =>
          `[Runde ${i+1}]:\n` + Object.entries(r)
            .map(([id, txt]) => {
              const a = agents.find(ag => ag.id === id);
              return `[${a?.name ?? id}]: ${txt}`;
            }).join('\n\n')
        ).join('\n\n---\n\n')
      : '';

    const ceoCtx = ceoFeedback
      ? `\n\n=== CEO-FEEDBACK AUS RUNDE ${round-1} ===\n${ceoFeedback}`
      : '';

    const sharedCtx = Object.keys(sharedKnowledge).length
      ? '\n\n=== GETEILTES WISSEN (von anderen Agenten) ===\n' +
        Object.entries(sharedKnowledge)
          .map(([key, val]) => `- ${key}: ${val}`).join('\n')
      : '';

    // ── Jeder Agent analysiert mit vollem Kontext ──
    for (const agent of agents) {
      process.stdout.write(`  [R${round}][${agent.name.padEnd(12)}] `);

      // Agent-zu-Agent-Fragen aus letzter Runde beantworten
      const queriesForMe = (allRounds[allRounds.length - 1]?.[`queries_${agent.id}`] ?? []);
      const answersCtx = queriesForMe.length
        ? '\n\nFragen die andere Agenten dir stellen:\n' +
          queriesForMe.map(q => `${q.asker} fragt: "${q.question}"`).join('\n')
        : '';

      const prompt = `Aufgabe: ${topic}${globalCtx}${prevRoundCtx}${ceoCtx}${sharedCtx}${answersCtx}

Runde ${round} von ${MAX_ROUNDS}.
${round > 1 ? 'Berücksichtige das CEO-Feedback und die Positionen der anderen Runden.' : ''}

Liefere deine Einschaetzung (3-5 Saetze). Du kannst auch Fragen an andere Abteilungen stellen mit dem Format:
"Frage an [Abteilungsname]: [deine Frage]"

Kein JSON, klarer Fließtext.`;

      const text = callClaude(agent.prompt, prompt);
      roundResults[agent.id] = text;

      // Queries extrahieren
      const queries = extractQueries(text);
      if (queries.length) {
        roundResults[`queries_${agent.id}`] = queries.map(q => ({
          asker: agent.name, ...q
        }));
        log.info(`[Loop] ${agent.name} stellt ${queries.length} Frage(n)`);
      }

      console.log('✓');
    }

    // ── Agent-zu-Agent-Fragen beantworten ──
    const pendingQueries = [];
    for (const agent of agents) {
      const queries = roundResults[`queries_${agent.id}`] ?? [];
      for (const q of queries) {
        const targetAgent = agents.find(a =>
          a.name.toLowerCase().includes(q.target) ||
          a.id.toLowerCase().includes(q.target)
        );
        if (targetAgent) {
          pendingQueries.push({ asker: agent, target: targetAgent, question: q.question });
        }
      }
    }

    if (pendingQueries.length) {
      console.log(`\n  Beantworte ${pendingQueries.length} direkte Agent-Fragen ...`);
      for (const pq of pendingQueries) {
        process.stdout.write(`  [${pq.target.name.padEnd(12)}→${pq.asker.name.padEnd(12)}] `);
        const answer = agentQuery(pq.asker, pq.target, pq.question, callClaude);
        // Antwort in geteiltes Wissen eintragen
        sharedKnowledge[`${pq.target.name} an ${pq.asker.name}`] = answer.slice(0, 200);
        console.log('✓');
      }
    }

    allRounds.push(roundResults);

    // Callback fuer Anzeige
    if (onRoundComplete) {
      await onRoundComplete(round, roundResults, agents);
    }

    // ── Konvergenz prüfen ──
    if (round > 1 && checkConvergence(prevPositions, roundResults)) {
      log.info(`[Loop] Konvergenz erreicht nach Runde ${round} — stoppe frueh`);
      converged = true;

      // CEO-Zwischenfeedback
      const allPos = agents.map(a => `[${a.name}]: ${roundResults[a.id]}`).join('\n\n');
      ceoFeedback = callClaude(
        'Du bist der CEO. Erkennst du Konvergenz in den Positionen? Fasse in 2-3 Saetzen zusammen was der Konsens ist und was noch offen bleibt.',
        `Thema: ${topic}\n\nPositionen Runde ${round}:\n${allPos}`
      );
      break;
    }

    // ── CEO-Zwischenfeedback für naechste Runde ──
    if (round < MAX_ROUNDS) {
      process.stdout.write(`  [CEO-Feedback    ] `);
      const allPos = agents.map(a => `[${a.name}]: ${roundResults[a.id]}`).join('\n\n');
      ceoFeedback = callClaude(
        'Du bist der CEO. Gib nach dieser Deliberationsrunde kurzes Feedback. Was ist noch ungeloest? Wo liegen die wichtigsten Spannungen? Welche Fragen muessen in der naechsten Runde beantwortet werden? 3-5 Saetze.',
        `Thema: ${topic}\n\nRunde ${round} Positionen:\n${allPos}`
      );
      console.log('✓');
      prevPositions = { ...roundResults };
    }
  }

  return {
    rounds: allRounds,
    sharedKnowledge,
    finalRound: allRounds[allRounds.length - 1],
    converged,
    totalRounds: allRounds.length,
  };
}

module.exports = { runIterativeLoop, MAX_ROUNDS };
