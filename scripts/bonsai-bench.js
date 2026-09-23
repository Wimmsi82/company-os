#!/usr/bin/env node
// scripts/bonsai-bench.js
// Misst das echte Tempo des lokalen Modells mit einem Assistenten-typischen Prompt
// (ca. 1.500 Wörter Kontext + kurze Frage). Grundlage für die Modellwahl am Pi.
//
// Nutzung: node scripts/bonsai-bench.js [URL]   (Default: LOCAL_LLM_URL oder http://127.0.0.1:8080)

require('dotenv').config();
const url = (process.argv[2] || process.env.LOCAL_LLM_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');

const context = Array.from({ length: 60 }, (_, i) =>
  `Absatz ${i + 1}: Der Mietvertrag für die Wohnung in Salzburg wurde am 1. März 2021 geschlossen. ` +
  'Die Kündigungsfrist beträgt drei Monate zum Quartalsende. Die Miete beträgt 1.250 Euro.').join('\n');

(async () => {
  const t0 = Date.now();
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'Du bist ein knapper Assistent. Antworte auf Deutsch.' },
        { role: 'user', content: `${context}\n\nFrage: Wie lange ist die Kündigungsfrist? Antworte in zwei Sätzen.` },
      ],
      max_tokens: 120,
      temperature: 0,
    }),
  }).catch(err => { console.error(`Nicht erreichbar: ${url} (${err.cause?.code ?? err.message})`); process.exit(1); });
  const data = await res.json();
  const sec = (Date.now() - t0) / 1000;
  const t = data.timings ?? {};

  console.log(`Antwort:      ${(data.choices?.[0]?.message?.content ?? '').trim().slice(0, 200)}`);
  console.log(`Gesamt:       ${sec.toFixed(1)} s`);
  if (t.prompt_n)    console.log(`Prompt:       ${t.prompt_n} Token, ${t.prompt_per_second?.toFixed(1)} Token/s`);
  if (t.predicted_n) console.log(`Generierung:  ${t.predicted_n} Token, ${t.predicted_per_second?.toFixed(1)} Token/s`);
  console.log(sec <= 30 ? 'Einschätzung: gut nutzbar im Chat.'
    : sec <= 90 ? 'Einschätzung: nutzbar, aber spürbar langsam. Kleineres Modell oder ASSISTANT_CONTEXT_CHARS senken.'
    : 'Einschätzung: zu langsam für Chat. Kleineres Modell wählen (install-bonsai-pi.sh 4B).');
})();
