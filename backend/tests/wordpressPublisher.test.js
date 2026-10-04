const test = require('node:test');
const assert = require('node:assert/strict');
const { wordpressConfig, deliverWordPress } = require('../services/wordpressPublisher');

const env = { WORDPRESS_SITE_URL: 'https://cms.example.test', WORDPRESS_USERNAME: 'publisher', WORDPRESS_APPLICATION_PASSWORD: 'test password', WORDPRESS_TENANT_ID: 'test-tenant' };
const variant = { id: '123e4567-e89b-12d3-a456-426614174000', channel: 'web', status: 'approved', body: 'Approved headline\nVerified content.' };

test('requires a configured HTTPS WordPress site', () => {
  assert.equal(wordpressConfig({}), null);
  assert.throws(() => wordpressConfig({ ...env, WORDPRESS_SITE_URL: 'http://cms.example.test' }), /HTTPS/);
});

test('publishes an approved web variant and checks provider receipt', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return calls.length === 1
    ? { ok: true, json: async () => [] }
    : { ok: true, json: async () => ({ id: 52, slug: `repurposed-${variant.id}`, status: 'publish', link: 'https://cms.example.test/posts/52' }) }; };
  const result = await deliverWordPress(variant, { tenantId: 'test-tenant', env, fetchImpl });
  assert.equal(result.providerId, '52');
  assert.equal(result.replayed, false);
  assert.equal(JSON.parse(calls[1].options.body).content, variant.body);
  assert.equal(calls[1].options.redirect, 'error');
});

test('retry recognizes the same published content without posting again', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => [{ id: 52, slug: `repurposed-${variant.id}`, status: 'publish', content: { raw: variant.body }, link: 'https://cms.example.test/posts/52' }] }; };
  assert.equal((await deliverWordPress(variant, { tenantId: 'test-tenant', env, fetchImpl })).replayed, true);
  assert.equal(calls, 1);
});
