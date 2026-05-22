import React, { useEffect, useState } from 'react';
import axios from 'axios';

// VIZ: bar chart of format performance (views, engagement, conversions)
// Pure SVG - no external chart library required.
function FormatPerformanceChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('views');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    axios.get('/api/custom-views/format-performance', { headers })
      .then((res) => setData(res.data.data || []))
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading format performance...</div>;
  if (error) return <div style={{ padding: 16, color: '#ff6b6b' }} data-testid="format-error">Error: {error}</div>;
  if (!data.length) return <div style={{ padding: 16 }}>No data.</div>;

  const width = 720;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 60, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => Number(d[metric]) || 0));
  const barW = innerW / data.length - 12;

  return (
    <div className="card" data-testid="format-performance" style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Format Performance</h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          aria-label="metric"
          style={{ background: '#0f0f1e', color: '#fff', border: '1px solid #6c63ff55', borderRadius: 6, padding: '4px 8px' }}
        >
          <option value="views">Views</option>
          <option value="engagement">Engagement %</option>
          <option value="conversions">Conversions</option>
        </select>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Format performance bar chart">
        {/* y-axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = padding.top + innerH - innerH * t;
          return (
            <g key={i}>
              <line x1={padding.left} x2={padding.left + innerW} y1={y} y2={y} stroke="#2a2a4a" strokeDasharray="3 3" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#888">
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {data.map((d, i) => {
          const v = Number(d[metric]) || 0;
          const h = max > 0 ? (v / max) * innerH : 0;
          const x = padding.left + i * (innerW / data.length) + 6;
          const y = padding.top + innerH - h;
          return (
            <g key={d.format}>
              <rect x={x} y={y} width={barW} height={h} fill={d.color || '#6c63ff'} rx="4">
                <title>{`${d.format}: ${v}`}</title>
              </rect>
              <text x={x + barW / 2} y={padding.top + innerH + 16} textAnchor="middle" fontSize="11" fill="#ccc">
                {d.format}
              </text>
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#fff">
                {v}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default FormatPerformanceChart;
