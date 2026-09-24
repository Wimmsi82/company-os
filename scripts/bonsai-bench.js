#!/usr/bin/env node
// scripts/bonsai-bench.js
// Misst das echte Tempo des Modells mit einem Assistenten-typischen Prompt
// (ca. 1.500 Wörter Kontext + kurze Frage). Grundlage für die Modellwahl.
//
// Nutzung: node scripts/bonsai-bench.js [URL]   (Default: LOCAL_LLM_URL oder http://127.0.0.1:8080)

require('dotenv').config();
const url = (process.argv[2] || process.env.LOCAL_LLM_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');

const context = Array.from({ length: 60 }, (_, i) =>
  `Absatz ${i + 1}: Der Mietvertrag für die Wohnung in Salzburg wurde am 1. März 2021 geschlossen. ` +
  'Die Kündigungsfrist beträgt drei Monate zum Quartalsende. Die Miete beträgt 1.250 Euro.').join('\n');

(async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LOCAL_LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LOCAL_LLM_API_KEY}`;

  const t0 = Date.now();
  // Eigenes Timeout: Node bricht sonst nach 300 s ohne Antwort-Header ab (UND_ERR_HEADERS_TIMEOUT)
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(600_000),
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'Du bist ein knapper Assistent. Antworte auf Deutsch.' },
        { role: 'user', content: `${context}\n\nFrage: Wie lange ist die Kündigungsfrist? Antworte in zwei Sätzen.` },
      ],
      max_tokens: 120,
      temperature: 0,
    }),
  }).catch(err => {
    const why = err.name === 'TimeoutError' ? 'keine Antwort nach 10 min' : (err.cause?.code ?? err.message);
    console.error(`Nicht erreichbar: ${url} (${why})`);
    process.exit(1);
  });
  const data = await res.json().catch(() => ({}));
  const sec = (Date.now() - t0) / 1000;

  if (!res.ok || data.error) {
    console.error(`Fehler HTTP ${res.status}: ${data.error?.message ?? 'keine Details'}`);
    if (res.status === 401) console.error('API-Key fehlt oder falsch: LOCAL_LLM_API_KEY in .env prüfen.');
    process.exit(1);
  }

  const answer = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const t = data.timings ?? {};
  console.log(`Antwort:      ${answer.slice(0, 200) || '(leer)'}`);
  console.log(`Gesamt:       ${sec.toFixed(1)} s`);
  if (t.prompt_n)    console.log(`Prompt:       ${t.prompt_n} Token, ${t.prompt_per_second?.toFixed(1)} Token/s`);
  if (t.predicted_n) console.log(`Generierung:  ${t.predicted_n} Token, ${t.predicted_per_second?.toFixed(1)} Token/s`);
  console.log(sec <= 30 ? 'Einschätzung: gut nutzbar im Chat.'
    : sec <= 90 ? 'Einschätzung: nutzbar, aber spürbar langsam. ASSISTANT_CONTEXT_CHARS senken.'
    : 'Einschätzung: zu langsam für Chat (Werte vom Pi 5: docs/ASSISTENT.md, Abschnitt Modellwahl).');
})();
