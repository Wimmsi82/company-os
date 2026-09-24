// src/notifications/telegram-bot.js
// Telegram als Chat-Schnittstelle zum Assistenten (Long Polling, kein offener Port).
// Antwortet ausschliesslich der Chat-ID aus TELEGRAM_CHAT_ID.

const log = require('../utils/log');

const MAX_LEN = 4000; // Telegram-Limit 4096

function api(method, body, timeoutMs = 15000) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  }).then(r => r.json());
}

function chunks(text) {
  const out = [];
  let rest = String(text);
  while (rest.length > MAX_LEN) {
    let cut = rest.lastIndexOf('\n', MAX_LEN);
    if (cut < MAX_LEN / 2) cut = MAX_LEN;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) out.push(rest);
  return out;
}

async function reply(chatId, text) {
  for (const part of chunks(text)) {
    // Bewusst ohne parse_mode: Notiz-Inhalte würden Markdown-Parsing-Fehler auslösen
    const res = await api('sendMessage', { chat_id: chatId, text: part, disable_web_page_preview: true });
    if (!res.ok) log.error(`[Telegram-Bot] Senden fehlgeschlagen: ${res.description}`);
  }
}

let running = false;

async function handleUpdate(update, assistant) {
  const msg = update.message;
  if (!msg?.text) return;
  const allowed = String(process.env.TELEGRAM_CHAT_ID);
  if (String(msg.chat.id) !== allowed) {
    log.warn(`[Telegram-Bot] Nachricht von fremder Chat-ID ${msg.chat.id} ignoriert`);
    return;
  }

  // "tippt …" anzeigen, solange das lokale Modell rechnet
  const typing = setInterval(() => api('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {}), 4500);
  api('sendChatAction', { chat_id: msg.chat.id, action: 'typing' }).catch(() => {});
  try {
    const result = await assistant.handle({
      channel: 'telegram',
      chatId: msg.chat.id,
      text: msg.text,
      notify: (text) => reply(msg.chat.id, text).catch(() => {}),
    });
    await reply(msg.chat.id, result.reply);
  } catch (err) {
    log.error(`[Telegram-Bot] ${err.message}`);
    await reply(msg.chat.id, `✗ Fehler: ${err.message}`).catch(() => {});
  } finally {
    clearInterval(typing);
  }
}

/** Startet den Polling-Loop. No-op ohne Token/Chat-ID. */
function start(assistant = require('../assistant')) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    log.info('[Telegram-Bot] nicht aktiv (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID fehlen)');
    return;
  }
  if (running) return;
  running = true;
  log.info('[Telegram-Bot] Polling gestartet');

  (async () => {
    let offset = 0;
    await api('setMyCommands', {
      commands: [
        { command: 'suche', description: 'Vault durchsuchen' },
        { command: 'heute', description: 'Todoist + Eskalationen + neue Notizen' },
        { command: 'aufgabe', description: 'Todoist-Aufgabe: Text @ Fälligkeit' },
        { command: 'notiz', description: 'Neue Notiz: Idee|Ref|Log: Titel | Text' },
        { command: 'status', description: 'Company-OS-Status' },
        { command: 'eskalationen', description: 'Offene Eskalationen' },
        { command: 'neu', description: 'Verlauf zurücksetzen' },
        { command: 'hilfe', description: 'Alle Befehle' },
      ],
    }).catch(() => {});

    while (running) {
      try {
        const res = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 60000);
        if (!res.ok) throw new Error(res.description ?? 'getUpdates fehlgeschlagen');
        for (const update of res.result) {
          offset = update.update_id + 1;
          // Nicht awaiten: /status soll nicht auf eine laufende LLM-Antwort warten.
          // Die LLM-Aufrufe selbst serialisiert der Assistent.
          handleUpdate(update, assistant);
        }
      } catch (err) {
        log.warn(`[Telegram-Bot] Polling-Fehler: ${err.message} — neuer Versuch in 10s`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  })();
}

function stop() { running = false; }

module.exports = { start, stop, chunks };
