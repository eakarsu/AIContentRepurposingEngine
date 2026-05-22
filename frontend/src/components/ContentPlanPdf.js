import React, { useState } from 'react';
import axios from 'axios';
import { FiDownload, FiFileText } from 'react-icons/fi';

// NON-VIZ: trigger PDF download for the content repurposing plan
function ContentPlanPdf() {
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setStatus('');
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get('/api/custom-views/content-plan-pdf', {
        headers,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content_plan_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatus('PDF downloaded.');
    } catch (e) {
      setStatus(`Error: ${e.response?.data?.error || e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card" data-testid="content-plan-pdf" style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, color: '#fff' }}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FiFileText /> Content Plan (PDF)
      </h3>
      <p style={{ color: '#bbb', fontSize: 13, lineHeight: 1.5 }}>
        Download a printable weekly cadence plan that bundles your active repurposing rules
        and a snapshot of recent format performance.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        data-testid="download-pdf-btn"
        style={{
          background: 'linear-gradient(135deg, #6c63ff, #00d2ff)',
          color: '#fff', border: 0, borderRadius: 8,
          padding: '10px 16px', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontWeight: 600,
        }}
      >
        <FiDownload /> {downloading ? 'Generating...' : 'Download PDF'}
      </button>
      {status && (
        <div style={{ marginTop: 10, fontSize: 12, color: status.startsWith('Error') ? '#ff6b6b' : '#06d6a0' }}>
          {status}
        </div>
      )}
    </div>
  );
}

export default ContentPlanPdf;
