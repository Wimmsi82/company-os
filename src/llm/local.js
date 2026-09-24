// src/llm/local.js
// Client für Bonsai über PrismML-llama.cpp `llama-server` (OpenAI-kompatible Chat-API).
// Läuft auf dem Mac und wird vom Pi über Tailscale angesprochen (LOCAL_LLM_URL).
// Nur für den Assistenten-Chat, die Company-OS-Agenten laufen über src/api/claude.js.

const DEFAULT_URL = 'http://127.0.0.1:8080';

function baseUrl() {
  return (process.env.LOCAL_LLM_URL || DEFAULT_URL).replace(/\/+$/, '');
}

function unreachable(detail) {
  return new Error(`Modell nicht erreichbar unter ${baseUrl()} (${detail}). Ist der Mac an und wach?`);
}

/** Prüft, ob llama-server läuft. /health braucht bei llama-server keinen API-Key. */
async function health(timeoutMs = 3000) {
  try {
    const res = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch { return false; }
}

/**
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {{ maxTokens?:number, temperature?:number, timeoutMs?:number }} opts
 * @returns {Promise<{ text:string, tokens:number, ms:number }>}
 */
async function chat(messages, opts = {}) {
  // Ein schlafender Tailscale-Peer lehnt nicht ab, die Verbindung hängt bis zum Timeout.
  // Der kurze Vorab-Check lässt den Chat in Sekunden auf die Vault-Treffer zurückfallen.
  if (!(await health())) throw unreachable('keine Antwort auf /health');

  const started = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? '240000'));
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LOCAL_LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LOCAL_LLM_API_KEY}`;
  try {
    const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: process.env.LOCAL_LLM_MODEL || 'bonsai',
        messages,
        max_tokens: opts.maxTokens ?? parseInt(process.env.LOCAL_LLM_MAX_TOKENS ?? '700'),
        temperature: opts.temperature ?? 0.3,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401) throw new Error('Modell lehnt ab: API-Key fehlt oder falsch (LOCAL_LLM_API_KEY)');
      throw new Error(`llama-server HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content ?? '';
    // Reasoning-Modelle liefern teils <think>…</think> mit — nicht an den Nutzer geben
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, tokens: data.usage?.total_tokens ?? 0, ms: Date.now() - started };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Modell hat nicht rechtzeitig geantwortet (Timeout)');
    if (err.message === 'fetch failed') throw unreachable(err.cause?.code ?? err.cause?.message ?? 'Netzwerkfehler');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { chat, health, baseUrl };
