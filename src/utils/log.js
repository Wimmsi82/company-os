// src/utils/log.js
const LEVEL = process.env.LOG_LEVEL ?? 'info';
const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const current = levels[LEVEL] ?? 1;

function fmt(level, msg) {
  const t = new Date().toISOString().slice(11, 19);
  return `[${t}] ${level.toUpperCase().padEnd(5)} ${msg}`;
}

module.exports = {
  debug: (m) => current <= 0 && console.log(fmt('debug', m)),
  info:  (m) => current <= 1 && console.log(fmt('info',  m)),
  warn:  (m) => current <= 2 && console.warn(fmt('warn',  m)),
  error: (m) => current <= 3 && console.error(fmt('error', m)),
};
