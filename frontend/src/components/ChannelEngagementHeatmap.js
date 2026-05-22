import React, { useEffect, useState } from 'react';
import axios from 'axios';

// VIZ: heatmap channel x topic
function ChannelEngagementHeatmap() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    axios.get('/api/custom-views/channel-heatmap', { headers })
      .then((res) => setPayload(res.data))
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading heatmap...</div>;
  if (error) return <div style={{ padding: 16, color: '#ff6b6b' }} data-testid="heatmap-error">Error: {error}</div>;
  if (!payload) return null;

  const { x_labels, y_labels, matrix, min, max } = payload;

  function colorFor(v) {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    // gradient indigo -> cyan -> hot pink
    const r = Math.round(108 + (255 - 108) * t);
    const g = Math.round(99 + (107 - 99) * (1 - t));
    const b = Math.round(255 - (255 - 107) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return (
    <div className="card" data-testid="channel-heatmap" style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, color: '#fff' }}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Channel x Topic Engagement</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4, margin: '0 auto' }}>
          <thead>
            <tr>
              <th></th>
              {x_labels.map((t) => (
                <th key={t} style={{ fontSize: 11, color: '#aaa', padding: '4px 8px' }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {y_labels.map((channel, r) => (
              <tr key={channel}>
                <td style={{ fontSize: 12, color: '#ddd', paddingRight: 8, textAlign: 'right' }}>{channel}</td>
                {matrix[r].map((v, c) => (
                  <td
                    key={c}
                    title={`${channel} / ${x_labels[c]}: ${v}`}
                    style={{
                      width: 64, height: 40,
                      background: colorFor(v),
                      borderRadius: 6,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      fontSize: 11,
                      color: '#0a0a1a',
                      fontWeight: 600,
                    }}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#aaa' }}>
        <span>low</span>
        <div style={{
          flex: 1, height: 10, borderRadius: 5,
          background: `linear-gradient(to right, ${colorFor(min)}, ${colorFor((min + max) / 2)}, ${colorFor(max)})`,
        }} />
        <span>high</span>
      </div>
    </div>
  );
}

export default ChannelEngagementHeatmap;
