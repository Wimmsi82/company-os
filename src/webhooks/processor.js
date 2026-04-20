// src/webhooks/processor.js
// Verarbeitet eingehende Webhook-Events und routet sie zu Tasks oder Deliberationen

const crypto  = require('crypto');
const db      = require('../db');
const log     = require('../utils/log');
const notify  = require('../notifications/telegram');

// ── ROUTING-REGELN ────────────────────────────────────────
// deliberate: true  → volle Deliberation aller Agenten
// deliberate: false → Task an zuständige Abteilung
// metric: 'name'    → Metrik aktualisieren (Wert aus payload.data.object.amount / 100)

const RULES = {
  stripe: {
    'payment_intent.succeeded':     { dept: 'finance',   severity: 'low',      deliberate: false, metric: 'monthly_revenue' },
    'payment_intent.payment_failed':{ dept: 'finance',   severity: 'high',     deliberate: false },
    'invoice.payment_failed':       { dept: 'finance',   severity: 'high',     deliberate: false },
    'customer.subscription.deleted':{ dept: 'sales',     severity: 'critical', deliberate: true  },
    'customer.subscription.updated':{ dept: 'sales',     severity: 'medium',   deliberate: false },
    'charge.dispute.created':       { dept: 'finance',   severity: 'critical', deliberate: true  },
    'checkout.session.completed':   { dept: 'sales',     severity: 'medium',   deliberate: false },
  },
  hubspot: {
    'deal.creation':                { dept: 'sales',     severity: 'medium',   deliberate: false },
    'deal.deletion':                { dept: 'sales',     severity: 'high',     deliberate: false },
    'deal.propertyChange':          { dept: 'sales',     severity: 'low',      deliberate: false },
    'contact.creation':             { dept: 'marketing', severity: 'low',      deliberate: false },
    'company.creation':             { dept: 'sales',     severity: 'medium',   deliberate: false },
  },
  generic: {
    // Freies Format — Payload bestimmt die Aktion
    // Erwartet: { event, summary, dept?, severity?, deliberate? }
    '*': { dept: 'strategy', severity: 'medium', deliberate: false },
  },
};

// Severity → deliberate-Schwellenwert
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

// ── SIGNATURE VERIFIKATION ────────────────────────────────

function verifyStripeSignature(rawBody, signature, secret) {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const payload = `${parts.t}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(parts.v1 ?? ''), Buffer.from(expected));
  } catch { return false; }
}

function verifyHmacSignature(rawBody, signature, secret) {
  try {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

// ── PAYLOAD NORMALISIEREN ─────────────────────────────────
// Gibt { eventType, summary, amount? } zurück

function normalizePayload(source, payload) {
  switch (source) {
    case 'stripe': {
      const obj = payload.data?.object ?? {};
      const amount = obj.amount ?? obj.amount_total ?? obj.plan?.amount;
      return {
        eventType: payload.type ?? 'unknown',
        summary: [
          payload.type,
          obj.customer_email ?? obj.customer ?? '',
          amount ? `${(amount / 100).toFixed(2)} ${(obj.currency ?? 'eur').toUpperCase()}` : '',
        ].filter(Boolean).join(' — '),
        amount: amount ? amount / 100 : null,
        currency: obj.currency ?? 'eur',
        customerId: obj.customer ?? null,
      };
    }
    case 'hubspot': {
      return {
        eventType: payload.subscriptionType ?? payload.eventType ?? 'unknown',
        summary: `HubSpot: ${payload.subscriptionType ?? 'event'} — Object ID ${payload.objectId ?? '?'}`,
        objectId: payload.objectId ?? null,
      };
    }
    case 'generic': {
      // Erwartet: { event, summary, dept?, severity?, deliberate? }
      return {
        eventType: payload.event ?? 'generic.event',
        summary:   payload.summary ?? payload.message ?? JSON.stringify(payload).slice(0, 200),
        dept:      payload.dept ?? null,
        severity:  payload.severity ?? null,
        deliberate: payload.deliberate ?? null,
      };
    }
    default:
      return {
        eventType: payload.type ?? payload.event ?? 'unknown',
        summary: JSON.stringify(payload).slice(0, 200),
      };
  }
}

// ── HAUPT-PROCESSOR ──────────────────────────────────────

async function processWebhookEvent(eventId, source, normalized, rule) {
  const { eventType, summary, amount, dept: payloadDept, deliberate: payloadDeliberate } = normalized;

  const dept       = payloadDept ?? rule.dept;
  const deliberate = payloadDeliberate ?? rule.deliberate;

  // Metrik aktualisieren wenn konfiguriert
  if (rule.metric && amount != null) {
    try {
      const current = db.getAllMetrics().find(m => m.name === rule.metric);
      if (current) {
        db.updateMetric(rule.metric, (current.value ?? 0) + amount);
        log.info(`[Webhook] Metrik ${rule.metric} +${amount}`);
      }
    } catch (err) {
      log.error(`[Webhook] Metrik-Update fehlgeschlagen: ${err.message}`);
    }
  }

  if (deliberate) {
    // Volle Deliberation triggern
    const topic = `WEBHOOK-ALERT [${source}/${eventType}]: ${summary}. Alle Abteilungen: Analyse und sofortige Handlungsempfehlung.`;
    db.createQueuedTopic({
      topic,
      reason: `Webhook-Event: ${source}/${eventType}`,
      priority: SEVERITY_RANK[rule.severity] >= 4 ? 'high' : 'medium',
      source: 'webhook',
    });
    log.warn(`[Webhook] Deliberation queued: ${source}/${eventType}`);
    // Telegram-Alert bei kritischen Events
    if (SEVERITY_RANK[rule.severity] >= 4) {
      notify.send(
        `🔔 *Webhook Alert — ${source.toUpperCase()}*\n\n${eventType}\n${summary.slice(0, 250)}\n\n_Deliberation ausgelöst_`
      ).catch(() => {});
    }
    db.setWebhookEventProcessed(eventId, 'deliberation');
  } else {
    // Task an zuständige Abteilung
    db.createTask({
      from_dept: `webhook_${source}`,
      to_dept: dept,
      type: 'action',
      priority: SEVERITY_RANK[rule.severity] >= 3 ? 2 : 4,
      title: `[${source.toUpperCase()}] ${eventType}`,
      body: `Webhook-Event eingegangen:\n\nQuelle: ${source}\nEvent: ${eventType}\nDetails: ${summary}\n\nAnalysiere und schlage Massnahmen vor.`,
      cycle_id: null,
    });
    log.info(`[Webhook] Task erstellt für ${dept}: ${source}/${eventType}`);
    db.setWebhookEventProcessed(eventId, 'task');
  }
}

// ── ÖFFENTLICHE API ──────────────────────────────────────

async function handleWebhook({ source, rawBody, headers, payload }) {
  // Webhook-Config laden
  const config = db.getWebhookConfig(source) ?? db.getWebhookConfig('generic');
  if (!config) {
    log.warn(`[Webhook] Unbekannte Quelle: ${source}`);
    return { ok: false, error: 'Unbekannte Webhook-Quelle' };
  }

  // Signatur prüfen wenn Secret gesetzt
  if (config.secret) {
    let valid = false;
    if (source === 'stripe') {
      valid = verifyStripeSignature(rawBody, headers['stripe-signature'] ?? '', config.secret);
    } else {
      valid = verifyHmacSignature(rawBody, headers['x-hub-signature-256'] ?? headers['x-signature'] ?? '', config.secret);
    }
    if (!valid) {
      log.warn(`[Webhook] Ungültige Signatur: ${source}`);
      return { ok: false, error: 'Ungültige Signatur' };
    }
  }

  // Event normalisieren
  const normalized = normalizePayload(source, payload);
  const { eventType } = normalized;

  // Event in DB loggen
  const eventId = db.createWebhookEvent(source, eventType, payload);

  // Routing-Regel finden
  const sourceRules = RULES[source] ?? RULES.generic;
  const rule = sourceRules[eventType] ?? sourceRules['*'];

  if (!rule) {
    db.setWebhookEventIgnored(eventId);
    log.debug(`[Webhook] Kein Handler für ${source}/${eventType} — ignoriert`);
    return { ok: true, action: 'ignored' };
  }

  try {
    await processWebhookEvent(eventId, source, normalized, rule);
    return { ok: true, action: rule.deliberate ? 'deliberation' : 'task' };
  } catch (err) {
    db.setWebhookEventError(eventId, err.message);
    log.error(`[Webhook] Verarbeitung fehlgeschlagen: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { handleWebhook, RULES };
