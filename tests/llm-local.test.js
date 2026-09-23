const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const servers = [];
after(() => servers.forEach(s => { s.closeAllConnections(); s.close(); }));
beforeEach(() => { delete process.env.LOCAL_LLM_API_KEY; });

async function fakeServer(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${server.address().port}/`;
  return server;
}

function llamaServer(record) {
  return (req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
      record({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '<think>intern</think>\nAntwort' } }], usage: { total_tokens: 42 } }));
    });
  };
}

const llm = require('../src/llm/local');

test('llama-server-Client: OpenAI-Format, <think> wird entfernt, ohne Key kein Authorization-Header', async () => {
  let received;
  const server = await fakeServer(llamaServer(r => { received = r; }));

  const r = await llm.chat([{ role: 'user', content: 'Hallo' }], { maxTokens: 50 });
  assert.strictEqual(r.text, 'Antwort');
  assert.strictEqual(r.tokens, 42);
  assert.strictEqual(received.url, '/v1/chat/completions');
  assert.strictEqual(received.body.max_tokens, 50);
  assert.strictEqual(received.headers.authorization, undefined);
  assert.strictEqual(await llm.health(), true);

  await new Promise(r => server.close(r));
  await assert.rejects(llm.chat([{ role: 'user', content: 'x' }]),
    /Modell nicht erreichbar unter http:\/\/127\.0\.0\.1:\d+ \(keine Antwort auf \/health\)\. Ist der Mac an und wach\?/);
  assert.strictEqual(await llm.health(), false);
});

test('LOCAL_LLM_API_KEY wird als Bearer-Token gesendet', async () => {
  let received;
  await fakeServer(llamaServer(r => { received = r; }));
  process.env.LOCAL_LLM_API_KEY = 'geheim123';
  await llm.chat([{ role: 'user', content: 'Hallo' }]);
  assert.strictEqual(received.headers.authorization, 'Bearer geheim123');
});

test('401 vom Server → verständliche Meldung zum API-Key', async () => {
  await fakeServer((req, res) => {
    if (req.url === '/health') { res.end('{"status":"ok"}'); return; }
    res.statusCode = 401;
    res.end('{"error":{"message":"Invalid API Key"}}');
  });
  await assert.rejects(llm.chat([{ role: 'user', content: 'x' }]), /API-Key fehlt oder falsch/);
});

test('Schlafender Rechner (/health hängt) → Fehler nach Sekunden, nicht nach dem Chat-Timeout', async () => {
  let chatCalled = false;
  await fakeServer((req) => {
    if (req.url !== '/health') chatCalled = true;
    // keine Antwort: simuliert einen Peer, der die Verbindung annimmt, aber nicht reagiert
  });
  process.env.LOCAL_LLM_TIMEOUT_MS = '60000';
  const t0 = Date.now();
  await assert.rejects(llm.chat([{ role: 'user', content: 'x' }]), /Modell nicht erreichbar/);
  delete process.env.LOCAL_LLM_TIMEOUT_MS;
  assert.ok(Date.now() - t0 < 6000, `dauerte ${Date.now() - t0} ms`);
  assert.strictEqual(chatCalled, false);
});
