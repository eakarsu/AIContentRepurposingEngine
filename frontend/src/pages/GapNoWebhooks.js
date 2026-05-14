// // === Batch 02 Gaps & Frontend Mounts ===
import React, { useState } from 'react';

/**
 * Gap/CFS Feature Page: No webhooks.
 * Slug: no-webhooks
 * Backend: /api/gap-no-webhooks
 */
export default function NoWebhooksPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      let body;
      try { body = JSON.parse(input); } catch (_) { body = { input }; }
      const res = await fetch('/api/gap-no-webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#e5e7eb' }}>
      <h2 style={{ marginBottom: 8 }}>No webhooks.</h2>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>No webhooks.</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ fontSize: 13, opacity: 0.85 }}>
          Input (text or JSON):
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={8}
          placeholder='Describe the case or paste JSON, e.g. {"context": "..."}'
          style={{
            padding: 10,
            borderRadius: 6,
            border: '1px solid #374151',
            background: '#111827',
            color: '#e5e7eb',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            border: 'none',
            background: loading ? '#6b7280' : '#2563eb',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          {loading ? 'Running...' : 'Run Analysis'}
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 16, padding: 12, background: '#7f1d1d', borderRadius: 6, color: '#fee2e2' }}>
          Error: {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 16, padding: 12, background: '#0f172a', borderRadius: 6, border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Model: {result.model || 'n/a'} | Tokens: {result.tokens || 'n/a'}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, margin: 0 }}>
{JSON.stringify(result.ai_result || result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
