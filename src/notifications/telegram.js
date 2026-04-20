// src/notifications/telegram.js
// Telegram-Push-Notifications für kritische Events
// Benötigt: TELEGRAM_BOT_TOKEN und TELEGRAM_CHAT_ID in .env
// Setup: @BotFather → /newbot → Token, @userinfobot → Chat-ID

const log = require('../utils/log');

/**
 * Sendet eine Nachricht via Telegram Bot API.
 * Non-blocking — Fehler werden geloggt, aber nicht geworfen.
 * @param {string} message - Markdown-Text (Telegram MarkdownV1)
 */
async function send(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return; // Stumm wenn nicht konfiguriert

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:    chatId,
        text:       message,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      log.warn(`[Telegram] API-Fehler ${res.status}: ${body.slice(0, 100)}`);
    }
  } catch (err) {
    log.warn(`[Telegram] Senden fehlgeschlagen: ${err.message}`);
  }
}

module.exports = { send };
