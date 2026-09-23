const { test } = require('node:test');
const assert = require('node:assert');
const { chunks } = require('../src/notifications/telegram-bot');

test('lange Antworten werden an Zeilengrenzen unter 4096 Zeichen geteilt', () => {
  const text = Array.from({ length: 300 }, (_, i) => `Zeile ${i} ` + 'x'.repeat(30)).join('\n');
  const parts = chunks(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => p.length <= 4000));
  assert.strictEqual(parts.join('\n'), text);
});
