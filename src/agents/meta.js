// src/agents/meta.js
// Meta-Agent: bewertet Agent-Performance und verbessert System-Prompts

const claude = require('../api/claude');
const db = require('../db');
const log = require('../utils/log');

const META_SYSTEM = `Du bist ein Meta-Agent der die Qualitaet anderer KI-Agenten bewertet und verbessert.
Du analysierst Einschaetzungen sachlich, erkennst Schwaechen und formulierst bessere System-Prompts.
Dein Ziel: jeder Agent soll mit der Zeit praeziser, nuancierter und nuetzlicher werden.
Deutsch. Direkt. Kein Selbstlob.`;

// Einzelnen Agenten bewerten
async function evaluateAgent({ agentId, agentName, currentPrompt, topic, analysis, negotiationPerformance }) {
  log.info(`[Meta] Bewerte Agent: ${agentName}`);

  const prompt = `Agent: ${agentName} (${agentId})

Thema der Deliberation: ${topic}

Analyse des Agenten:
${analysis}

${negotiationPerformance ? `Verhandlungsperformance:\n${negotiationPerformance}` : ''}

Aktueller System-Prompt:
${currentPrompt}

Bewerte im JSON-Format:
{
  "score": 1-10,
  "strengths": ["Staerke 1", "Staerke 2"],
  "weaknesses": ["Schwaeche 1", "Schwaeche 2"],
  "blind_spots": ["Was hat dieser Agent typischerweise uebersehen?"],
  "improved_prompt": "Verbesserter System-Prompt der die Schwaechen adressiert. Behalte den Kern, schaerfe die Fokus-Bereiche.",
  "reasoning": "Warum diese Bewertung?"
}
Nur JSON.`;

  const { text } = await claude.call(META_SYSTEM, prompt, { max_tokens: 1500 });
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { score: 5, strengths: [], weaknesses: [], blind_spots: [], improved_prompt: currentPrompt, reasoning: text };
  }
}

// Alle Agenten nach einer Deliberation bewerten und verbessern
async function runMetaEvaluation({ topic, phase1, phase2, negotiations, agentRegistry }) {
  log.info('[Meta] Meta-Evaluation startet ...');
  const evaluations = {};
  const improvements = [];

  for (const agent of agentRegistry.list()) {
    if (!phase1[agent.id]) continue;

    // Verhandlungsperformance dieses Agenten zusammenstellen
    const negPerf = Object.entries(negotiations ?? {})
      .filter(([key]) => key.includes(agent.id))
      .map(([key, n]) => `${n.topic}:\n${n.conclusion}`)
      .join('\n\n');

    try {
      const evaluation = await evaluateAgent({
        agentId: agent.id,
        agentName: agent.name,
        currentPrompt: agent.systemPrompt,
        topic,
        analysis: `Phase 1: ${phase1[agent.id]}\n\nPhase 2: ${phase2[agent.id] ?? ''}`,
        negotiationPerformance: negPerf || null,
      });

      evaluations[agent.id] = evaluation;

      // Prompt verbessern wenn Score unter 7
      if (evaluation.score < 7 && evaluation.improved_prompt && evaluation.improved_prompt !== agent.systemPrompt) {
        agent.updateSystemPrompt(evaluation.improved_prompt);
        improvements.push({
          agent: agent.name,
          oldScore: evaluation.score,
          reason: evaluation.reasoning,
        });
        log.info(`[Meta] Prompt verbessert fuer ${agent.name} (Score war ${evaluation.score}/10)`);
      }

      // Bewertung im Gedaechtnis speichern
      db.upsertMemory(`meta`, `score_${agent.id}`, String(evaluation.score), { confidence: 0.9 });
      db.upsertMemory(`meta`, `weaknesses_${agent.id}`, evaluation.weaknesses.join(', '), { confidence: 0.8 });

    } catch (err) {
      log.error(`[Meta] Bewertung fehlgeschlagen fuer ${agent.name}: ${err.message}`);
    }
  }

  log.info(`[Meta] Evaluation abgeschlossen. ${improvements.length} Prompts verbessert.`);
  return { evaluations, improvements };
}

// Performance-Bericht aller Agenten
function getPerformanceReport() {
  try {
    const memory = db.getAllMemory();
    const scores = memory.filter(m => m.dept === 'meta' && m.key.startsWith('score_'));
    return scores.map(s => ({
      agent: s.key.replace('score_', ''),
      score: parseFloat(s.value),
      updated: s.updated_at,
    })).sort((a, b) => b.score - a.score);
  } catch { return []; }
}

module.exports = { runMetaEvaluation, getPerformanceReport };
