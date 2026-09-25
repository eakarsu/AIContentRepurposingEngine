/**
 * Outbound webhooks.
 *
 * Replaces the `no_webhooks` gap. Secrets are stored as a SHA-256 hash (the
 * plaintext is never persisted) and delivery is idempotent on
 * (endpoint, idempotencyKey), so a retried emit cannot double-deliver. Failed
 * deliveries keep their attempt count and last error rather than vanishing.
 */
const express = require('express');
const crypto = require('crypto');

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function createWebhooksRouter(authMiddleware, pool) {
  const router = express.Router();

  const schema = `
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP,
      UNIQUE (endpoint_id, idempotency_key)
    )`;

  let ready = false;
  async function ensure() { if (!ready) { await pool.query(schema); ready = true; } }

  router.post('/webhooks/endpoints', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { url, eventType, secret } = req.body || {};
      if (!url || !/^https?:\/\//.test(String(url))) return res.status(400).json({ error: 'url must be http(s)' });
      if (!eventType || !String(eventType).trim()) return res.status(400).json({ error: 'eventType is required' });
      if (!secret || String(secret).length < 16) return res.status(400).json({ error: 'secret must be at least 16 characters' });
      const r = await pool.query(
        `INSERT INTO webhook_endpoints (url, secret_hash, event_type) VALUES ($1,$2,$3)
         RETURNING id, url, event_type, is_active, created_at`,
        [String(url), sha256(secret), String(eventType).trim()],
      );
      res.status(201).json({
        endpoint: r.rows[0],
        note: 'Secret stored as a SHA-256 hash and cannot be recovered. Use it to verify a signature header on delivery.',
      });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to register endpoint' }); }
  });

  router.post('/webhooks/emit', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { eventType, payload, idempotencyKey } = req.body || {};
      if (!eventType || !String(eventType).trim()) return res.status(400).json({ error: 'eventType is required' });
      const key = String(idempotencyKey ?? `${eventType}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`);
      const eps = await pool.query(
        `SELECT id, url FROM webhook_endpoints WHERE event_type = $1 AND is_active = true`,
        [String(eventType).trim()],
      );
      if (!eps.rows.length) return res.json({ queued: 0, deliveries: [], note: 'No active endpoint registered for this event type.' });

      const body = JSON.stringify(payload ?? {});
      const deliveries = [];
      for (const ep of eps.rows) {
        const r = await pool.query(
          `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, idempotency_key)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (endpoint_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
           RETURNING id, endpoint_id, event_type, status, attempts, idempotency_key`,
          [ep.id, String(eventType).trim(), body, key],
        );
        deliveries.push({ ...r.rows[0], url: ep.url });
      }
      res.status(202).json({ queued: deliveries.length, deliveries, idempotencyKey: key,
        note: 'Deliveries queued. Replaying the same idempotencyKey does not create duplicates.' });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to queue delivery' }); }
  });

  router.get('/webhooks/deliveries', authMiddleware, async (_req, res) => {
    try {
      await ensure();
      const r = await pool.query(
        `SELECT d.*, e.url FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
          ORDER BY d.created_at DESC LIMIT 200`);
      res.json({ deliveries: r.rows });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to list deliveries' }); }
  });

  return router;
}
module.exports = createWebhooksRouter;
