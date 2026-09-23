const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

let server;
after(() => server?.close());

test('llama-server-Client: OpenAI-Format, <think> wird entfernt, klare Fehlermeldungen', async () => {
  let received;
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
      received = { url: req.url, body: JSON.parse(body) };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '<think>intern</think>\nAntwort' } }], usage: { total_tokens: 42 } }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${server.address().port}/`;
  const llm = require('../src/llm/local');

  const r = await llm.chat([{ role: 'user', content: 'Hallo' }], { maxTokens: 50 });
  assert.strictEqual(r.text, 'Antwort');
  assert.strictEqual(r.tokens, 42);
  assert.strictEqual(received.url, '/v1/chat/completions');
  assert.strictEqual(received.body.max_tokens, 50);
  assert.strictEqual(await llm.health(), true);

  const port = server.address().port;
  await new Promise(r => server.close(r));
  server = null;
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${port}`;
  await assert.rejects(llm.chat([{ role: 'user', content: 'x' }]), /nicht erreichbar unter http:\/\/127\.0\.0\.1:\d+ \(\w+\) — läuft bonsai\.service\?/);
  assert.strictEqual(await llm.health(), false);
});
