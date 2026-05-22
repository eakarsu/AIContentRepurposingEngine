import React, { useState } from 'react';

export default function ChannelFatiguePage() {
  const [payload, setPayload] = useState(JSON.stringify({ channels: [
    { name: 'LinkedIn', posts_7d: 9, engagement_delta: -0.18, duplicate_theme_rate: 0.42 },
    { name: 'Newsletter', posts_7d: 2, engagement_delta: 0.04, duplicate_theme_rate: 0.12 }
  ] }, null, 2));
  const [result, setResult] = useState(null);
  const run = async () => {
    const res = await fetch('/api/channel-fatigue/score', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify(JSON.parse(payload)) });
    setResult(await res.json());
  };
  return (
    <div style={{ padding: 32 }}>
      <h1>Channel Fatigue Planner</h1>
      <textarea style={{ width: '100%', minHeight: 220 }} value={payload} onChange={(event) => setPayload(event.target.value)} />
      <button onClick={run}>Score Channels</button>
      {result && <section><h2>{result.fatiguedCount} fatigued</h2>{result.channels.map((row) => <p key={row.name}>{row.name}: {row.tier} · {row.action}</p>)}</section>}
    </div>
  );
}
