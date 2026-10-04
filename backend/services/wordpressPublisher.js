'use strict';

function wordpressConfig(env = process.env) {
  const site = String(env.WORDPRESS_SITE_URL || '').trim();
  const username = String(env.WORDPRESS_USERNAME || '').trim();
  const password = String(env.WORDPRESS_APPLICATION_PASSWORD || '');
  const tenantId = String(env.WORDPRESS_TENANT_ID || '').trim();
  if (!site || !username || !password || !tenantId) return null;
  let url;
  try { url = new URL(site); } catch { throw new Error('Invalid WordPress site URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('WordPress site URL must be HTTPS without credentials or query parameters');
  return { endpoint: `${url.href.replace(/\/+$/, '')}/wp-json/wp/v2/posts`, username, password, tenantId };
}

function titleFor(body) {
  const firstLine = String(body || '').split(/\r?\n/).map(line => line.replace(/<[^>]*>/g, '').replace(/^#+\s*/, '').trim()).find(Boolean);
  return (firstLine || 'Approved content').slice(0, 100);
}

async function deliverWordPress(variant, { tenantId, env = process.env, fetchImpl = fetch } = {}) {
  const config = wordpressConfig(env);
  if (!config) throw new Error('WordPress delivery is not configured');
  if (String(tenantId) !== config.tenantId) throw new Error('WordPress destination is not assigned to this tenant');
  if (variant.channel !== 'web' || variant.status !== 'approved') throw new Error('Only approved web variants can be delivered to WordPress');
  const slug = `repurposed-${String(variant.id).replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`, Accept: 'application/json' };
  const lookup = await fetchImpl(`${config.endpoint}?slug=${encodeURIComponent(slug)}&context=edit`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!lookup.ok) throw new Error(`WordPress lookup failed with HTTP ${lookup.status}`);
  const existing = await lookup.json();
  if (!Array.isArray(existing)) throw new Error('WordPress lookup returned an invalid response');
  if (existing.length) {
    const post = existing[0];
    if (post.slug !== slug || post.status !== 'publish' || post.content?.raw !== variant.body || !Number.isSafeInteger(Number(post.id)) || Number(post.id) < 1) {
      throw new Error('WordPress slug already exists with different content or status');
    }
    return { providerId: String(post.id), providerUrl: String(post.link || ''), replayed: true, status: post.status };
  }
  const created = await fetchImpl(config.endpoint, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ slug, status: 'publish', title: titleFor(variant.body), content: variant.body }),
  });
  if (!created.ok) throw new Error(`WordPress publish failed with HTTP ${created.status}`);
  const post = await created.json();
  if (post.slug !== slug || post.status !== 'publish' || !Number.isSafeInteger(Number(post.id)) || Number(post.id) < 1) throw new Error('WordPress did not confirm the published post');
  return { providerId: String(post.id), providerUrl: String(post.link || ''), replayed: false, status: post.status };
}

module.exports = { wordpressConfig, titleFor, deliverWordPress };
