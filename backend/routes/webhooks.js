/**
 * Outbound webhooks — real delivery with signed payloads and retry bookkeeping.
 *
 * - Endpoints and deliveries are scoped to the authenticated user.
 * - The signing secret is encrypted at rest (AES-256-GCM, key derived from
 *   WEBHOOK_ENCRYPTION_KEY or JWT_SECRET) so deliveries can be signed; a
 *   SHA-256 hash is also kept for reference.
 * - `emit` attempts delivery immediately. Failures keep their attempt count
 *   and last error, transition through pending -> dead_letter after the
 *   endpoint's max attempts, and can be retried explicitly.
 */
const express = require('express');
const crypto = require('crypto');

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function encryptionKey() {
  const material = process.env.WEBHOOK_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!material) throw new Error('WEBHOOK_ENCRYPTION_KEY (or JWT_SECRET) is required to store webhook secrets');
  return crypto.createHash('sha256').update(String(material)).digest();
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(payload) {
  const [version, ivB64, tagB64, dataB64] = String(payload || '').split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('unsupported stored secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

function signatureFor(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

function backoffMs(attempt) {
  return Math.min(300000, 1000 * (2 ** Math.max(0, attempt - 1)));
}

function createWebhooksRouter(authMiddleware, pool) {
  const router = express.Router();

  const schema = `
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      secret_encrypted TEXT,
      event_type TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP,
      UNIQUE (endpoint_id, idempotency_key)
    )`;

  // Existing databases predate scoping/retry columns; additive and idempotent.
  const schemaUpgrades = `
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_encrypted TEXT;
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user ON webhook_endpoints(user_id, event_type, is_active);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(user_id, status, next_attempt_at)`;

  let ready = false;
  async function ensure() { if (!ready) { await pool.query(schema); await pool.query(schemaUpgrades); ready = true; } }

  /** Attempt one delivery and persist the outcome. */
  async function deliver(delivery, secret, maxAttempts) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': String(delivery.event_type),
      'X-Webhook-Delivery': String(delivery.id),
      'X-Webhook-Signature': signatureFor(secret, delivery.payload),
    };

    let status = 'delivered';
    let lastError = null;
    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers,
        body: delivery.payload,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        status = 'failed';
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      status = 'failed';
      lastError = error.message || 'delivery failed';
    }

    if (status === 'delivered') {
      const updated = await pool.query(
        `UPDATE webhook_deliveries
         SET status = 'delivered', attempts = attempts + 1, last_error = NULL,
             delivered_at = NOW(), next_attempt_at = NULL
         WHERE id = $1 RETURNING status, attempts, delivered_at`,
        [delivery.id]
      );
      return { ...updated.rows[0], ok: true };
    }

    const attempts = Number(delivery.attempts) + 1;
    const nextStatus = attempts >= Number(maxAttempts || 5) ? 'dead_letter' : 'pending';
    const nextAttemptAt = nextStatus === 'pending'
      ? new Date(Date.now() + backoffMs(attempts))
      : null;
    const updated = await pool.query(
      `UPDATE webhook_deliveries
       SET status = $1, attempts = $2, last_error = $3, next_attempt_at = $4
       WHERE id = $5 RETURNING status, attempts, last_error, next_attempt_at`,
      [nextStatus, attempts, String(lastError).slice(0, 300), nextAttemptAt, delivery.id]
    );
    return { ...updated.rows[0], ok: false };
  }

  router.post('/webhooks/endpoints', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { url, eventType, secret } = req.body || {};
      if (!url || !/^https?:\/\//.test(String(url))) return res.status(400).json({ error: 'url must be http(s)' });
      if (!eventType || !String(eventType).trim()) return res.status(400).json({ error: 'eventType is required' });
      if (!secret || String(secret).length < 16) return res.status(400).json({ error: 'secret must be at least 16 characters' });

      const r = await pool.query(
        `INSERT INTO webhook_endpoints (user_id, url, secret_hash, secret_encrypted, event_type)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, url, event_type, is_active, max_attempts, created_at`,
        [req.user.id, String(url), sha256(secret), encryptSecret(secret), String(eventType).trim()],
      );
      res.status(201).json({
        endpoint: r.rows[0],
        note: 'Deliveries are signed with X-Webhook-Signature: sha256=<HMAC-SHA256(body, secret)>. Keep the secret to verify them.',
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
        `SELECT id, url, secret_encrypted, max_attempts FROM webhook_endpoints
         WHERE event_type = $1 AND is_active = true AND user_id = $2`,
        [String(eventType).trim(), req.user.id],
      );
      if (!eps.rows.length) {
        return res.json({ queued: 0, deliveries: [], note: 'No active endpoint registered for this event type.' });
      }

      const body = JSON.stringify(payload ?? {});
      const deliveries = [];
      for (const ep of eps.rows) {
        if (!ep.secret_encrypted) {
          deliveries.push({ endpoint_id: ep.id, url: ep.url, status: 'failed', attempts: 0, last_error: 'Endpoint has no recoverable signing secret; re-register it.' });
          continue;
        }
        const row = await pool.query(
          `INSERT INTO webhook_deliveries (user_id, endpoint_id, event_type, payload, idempotency_key)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (endpoint_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
           RETURNING id, endpoint_id, event_type, status, attempts, idempotency_key`,
          [req.user.id, ep.id, String(eventType).trim(), body, key],
        );

        const delivery = row.rows[0];
        if (delivery.status === 'delivered') {
          deliveries.push({ ...delivery, url: ep.url, ok: true, note: 'Already delivered for this idempotency key.' });
          continue;
        }
        let secret;
        try {
          secret = decryptSecret(ep.secret_encrypted);
        } catch (error) {
          deliveries.push({ ...delivery, url: ep.url, ok: false, last_error: `Stored secret could not be decrypted: ${error.message}` });
          continue;
        }
        const outcome = await deliver({ ...delivery, payload: body, url: ep.url }, secret, ep.max_attempts);
        deliveries.push({ ...delivery, url: ep.url, ...outcome });
      }

      res.status(202).json({
        queued: deliveries.length,
        delivered: deliveries.filter((d) => d.ok).length,
        failed: deliveries.filter((d) => !d.ok).length,
        deliveries,
        idempotencyKey: key,
        note: 'Deliveries are attempted immediately and signed. Failed deliveries keep their attempt count and can be retried via POST /api/webhooks/deliveries/:id/retry.',
      });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to queue delivery' }); }
  });

  router.get('/webhooks/deliveries', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const r = await pool.query(
        `SELECT d.*, e.url FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
         WHERE d.user_id = $1
         ORDER BY d.created_at DESC LIMIT 200`,
        [req.user.id],
      );
      res.json({ deliveries: r.rows });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to list deliveries' }); }
  });

  router.post('/webhooks/deliveries/:id/retry', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const row = await pool.query(
        `SELECT d.*, e.url, e.secret_encrypted, e.max_attempts
         FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
         WHERE d.id = $1 AND d.user_id = $2`,
        [req.params.id, req.user.id],
      );
      const delivery = row.rows[0];
      if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
      if (delivery.status === 'delivered') return res.status(409).json({ error: 'Delivery has already been delivered' });
      if (delivery.status === 'dead_letter') {
        return res.status(409).json({ error: 'Delivery exhausted its attempts (dead_letter). Register a new endpoint or reset it explicitly.' });
      }
      if (!delivery.secret_encrypted) return res.status(409).json({ error: 'Endpoint has no recoverable signing secret; re-register it.' });

      const secret = decryptSecret(delivery.secret_encrypted);
      const outcome = await deliver({ ...delivery, payload: delivery.payload }, secret, delivery.max_attempts);
      res.status(outcome.ok ? 200 : 502).json({ delivery: { id: delivery.id, ...outcome } });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to retry delivery' }); }
  });

  return router;
}
module.exports = createWebhooksRouter;
