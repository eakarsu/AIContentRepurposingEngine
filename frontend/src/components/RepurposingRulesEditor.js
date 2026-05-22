import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FiPlus, FiTrash2, FiSave, FiEdit2, FiX } from 'react-icons/fi';

// NON-VIZ: CRUD editor for source -> target repurposing rules
function RepurposingRulesEditor() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ source: '', target: '', priority: 5, enabled: true, notes: '' });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    try {
      const res = await axios.get('/api/custom-views/repurposing-rules', { headers: headers() });
      setRules(res.data.rules || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ source: '', target: '', priority: 5, enabled: true, notes: '' });
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.source || !form.target) {
      setError('source and target are required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await axios.put(`/api/custom-views/repurposing-rules/${editingId}`, form, { headers: headers() });
      } else {
        await axios.post('/api/custom-views/repurposing-rules', form, { headers: headers() });
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (r) => {
    setEditingId(r.id);
    setForm({ source: r.source, target: r.target, priority: r.priority, enabled: r.enabled, notes: r.notes || '' });
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await axios.delete(`/api/custom-views/repurposing-rules/${id}`, { headers: headers() });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" data-testid="rules-editor" style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, color: '#fff' }}>
      <h3 style={{ marginTop: 0 }}>Repurposing Rules (source -> target)</h3>
      {error && <div style={{ color: '#ff6b6b', marginBottom: 8 }}>{error}</div>}

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 2fr auto', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          aria-label="source"
          placeholder="source (e.g. blog_post)"
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          style={inputStyle}
        />
        <input
          aria-label="target"
          placeholder="target (e.g. tweet_thread)"
          value={form.target}
          onChange={(e) => setForm({ ...form, target: e.target.value })}
          style={inputStyle}
        />
        <input
          aria-label="priority"
          type="number"
          min={1}
          max={99}
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: +e.target.value })}
          style={inputStyle}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          on
        </label>
        <input
          aria-label="notes"
          placeholder="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="submit" disabled={busy} data-testid="save-rule-btn" style={btnPrimary}>
            {editingId ? <FiSave /> : <FiPlus />}
            {editingId ? ' Save' : ' Add'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} style={btnGhost}>
              <FiX />
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div>Loading rules...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="rules-table">
            <thead>
              <tr style={{ textAlign: 'left', color: '#999' }}>
                <th style={th}>#</th>
                <th style={th}>Source</th>
                <th style={th}>Target</th>
                <th style={th}>Priority</th>
                <th style={th}>Enabled</th>
                <th style={th}>Notes</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #2a2a4a' }}>
                  <td style={td}>{r.id}</td>
                  <td style={td}><code>{r.source}</code></td>
                  <td style={td}><code>{r.target}</code></td>
                  <td style={td}>{r.priority}</td>
                  <td style={td}>{r.enabled ? 'YES' : 'no'}</td>
                  <td style={{ ...td, color: '#bbb' }}>{r.notes}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => edit(r)} style={iconBtn} title="edit"><FiEdit2 /></button>
                    <button onClick={() => remove(r.id)} style={iconBtn} title="delete"><FiTrash2 /></button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 12, color: '#888' }}>No rules yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  background: '#0f0f1e', color: '#fff', border: '1px solid #6c63ff44',
  borderRadius: 6, padding: '8px 10px', fontSize: 13,
};
const btnPrimary = {
  background: 'linear-gradient(135deg, #6c63ff, #00d2ff)', color: '#fff',
  border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600,
};
const btnGhost = {
  background: 'transparent', color: '#aaa', border: '1px solid #444',
  borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
};
const iconBtn = {
  background: 'transparent', color: '#9aa', border: 0, cursor: 'pointer',
  padding: 4, marginRight: 4,
};
const th = { padding: '8px 6px', fontWeight: 600 };
const td = { padding: '8px 6px' };

export default RepurposingRulesEditor;
