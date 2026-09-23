// src/llm/local.js
// Client für ein lokales Modell (Bonsai über PrismML-llama.cpp `llama-server`).
// Nutzt die OpenAI-kompatible Chat-API. Nur für den Assistenten-Chat —
// die Company-OS-Agenten laufen weiter über src/api/claude.js.

const DEFAULT_URL = 'http://127.0.0.1:8080';

function baseUrl() {
  return (process.env.LOCAL_LLM_URL || DEFAULT_URL).replace(/\/+$/, '');
}

/**
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {{ maxTokens?:number, temperature?:number, timeoutMs?:number }} opts
 * @returns {Promise<{ text:string, tokens:number, ms:number }>}
 */
async function chat(messages, opts = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? '240000'));
  try {
    const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`llama-server HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content ?? '';
    // Reasoning-Modelle liefern teils <think>…</think> mit — nicht an den Nutzer geben
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, tokens: data.usage?.total_tokens ?? 0, ms: Date.now() - started };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Lokales Modell hat nicht rechtzeitig geantwortet (Timeout)');
    if (err.message === 'fetch failed') {
      throw new Error(`Lokales Modell nicht erreichbar unter ${baseUrl()} (${err.cause?.code ?? err.cause?.message ?? 'Netzwerkfehler'}) — läuft bonsai.service?`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Prüft, ob llama-server läuft. */
async function health() {
  try {
    const res = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

module.exports = { chat, health, baseUrl };
