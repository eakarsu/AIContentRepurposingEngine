import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import NativeDialog from './NativeDialog';
import AIFieldPresets, { completeExample } from './AIFieldPresets';
import AIResultView from './AIResultView';
import useCancelableAI from './useCancelableAI';
import { contentFields, contentExamples } from './contentFields';

export default function ContentRecordDialog({ featureName, itemId, initialMode = 'view', providerResponse, onClose, onChanged = () => {} }) {
  const [item, setItem] = useState(null); const [draft, setDraft] = useState({ title: '', content: '', category: '' });
  const [editing, setEditing] = useState(initialMode === 'edit'); const [confirmDelete, setConfirmDelete] = useState(initialMode === 'delete');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [provider, setProvider] = useState(providerResponse); const alive = useRef(true); const ai = useCancelableAI();
  const fields = contentFields(featureName); const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const path = `/api/content/${encodeURIComponent(featureName)}/${encodeURIComponent(itemId)}`;
  const label = featureName.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const values = (record) => ({ title: record.title || '', content: record.content || '', category: record.category || '' });
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); setLoading(true); setError('');
    axios.get(path, { headers, signal: controller.signal }).then((response) => { if (!controller.signal.aborted) { const record = response.data.item || response.data; setItem(record); setDraft(values(record)); } }).catch((failure) => { if (!controller.signal.aborted) setError(failure.response?.data?.error || 'The saved record could not be loaded.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { alive.current = false; controller.abort(); };
    // eslint-disable-next-line
  }, [path]);
  const close = () => { if (busy) return; ai.cancel(); onClose(); };
  async function save(event) {
    event.preventDefault(); if (!draft.title.trim()) { setError('A title is required.'); return; }
    setBusy(true); setError('');
    try { const response = await axios.put(path, Object.fromEntries(fields.map((field) => [field.key, draft[field.key]])), { headers }); if (!alive.current) return; setItem(response.data.item || response.data); setEditing(false); await onChanged(); }
    catch (failure) { if (alive.current) setError(failure.response?.data?.error || failure.message || 'The record could not be saved.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await axios.delete(path, { headers }); await onChanged(); if (alive.current) onClose(); }
    catch (failure) { if (alive.current) setError(failure.response?.data?.error || failure.message || 'The record could not be deleted.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function generate() {
    if (!draft.title.trim() || !draft.content.trim()) { setError('Title and source content are required for AI generation.'); return; }
    setError('');
    const result = await ai.run(async (options) => {
      const response = await axios.post('/api/ai/generate', { feature: featureName, ...draft }, { headers, ...options });
      options.signal.throwIfAborted();
      if (typeof response.data.ai_output !== 'string' || !response.data.ai_output.trim()) throw new Error('OpenRouter did not return a complete content draft.');
      const saved = await axios.put(path, { ...Object.fromEntries(fields.map((field) => [field.key, draft[field.key]])), ai_output: response.data.ai_output }, { headers, ...options });
      options.signal.throwIfAborted();
      return { ...response.data, item: saved.data.item || saved.data };
    });
    if (result && alive.current) { setItem(result.item); setDraft(values(result.item)); setProvider(result); setEditing(false); await onChanged(); }
  }
  const actions = item && !loading ? <><button type="button" className="btn btn-outline" disabled={busy || ai.loading} onClick={() => { setDraft(values(item)); setEditing(true); setConfirmDelete(false); }}>Edit</button>{editing && <button type="submit" form="content-record-form" className="btn btn-primary" disabled={busy || ai.loading}>{busy ? 'Saving…' : 'Save changes'}</button>}<button type="button" className="btn btn-danger" disabled={busy || ai.loading} onClick={() => { setConfirmDelete(true); setEditing(false); }}>Delete</button><button type="button" className="btn btn-gradient" disabled={busy || ai.loading} onClick={generate}>{ai.loading ? 'Preparing draft…' : 'Generate with OpenRouter'}</button>{ai.loading && <button type="button" className="btn btn-outline" onClick={ai.cancel}>Cancel AI request</button>}</> : null;
  return <NativeDialog title={item?.title || `${label} record`} onClose={close} busy={busy} actions={actions}>
    {loading && <p role="status">Loading the saved content record…</p>}{error && <p className="sr-alert" role="alert">{error}</p>}
    {item && !loading && <><p className="sr-notice">{label} · {item.status || 'draft'}{item.created_at ? ` · Saved ${new Date(item.created_at).toLocaleString()}` : ''}</p>
      <AIFieldPresets fields={fields} samples={contentExamples} context={label} disabled={busy || ai.loading} onFill={(sample, index) => { setDraft(completeExample(fields, sample, index, label, draft)); setEditing(true); setConfirmDelete(false); setError(''); ai.setError(null); }}/>
      {editing ? <form id="content-record-form" onSubmit={save} className="modal-body">{fields.map((field) => <label className="form-group" key={field.key}><span className="form-label">{field.label}{field.key === 'title' ? ' *' : field.key === 'category' ? ' · Optional' : ' · Required for AI'}</span>{field.type === 'textarea' ? <textarea className="form-textarea" rows={8} maxLength={50000} value={draft[field.key]} disabled={busy || ai.loading} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}/> : <input className="form-input" maxLength={field.maxLength} required={field.key === 'title'} value={draft[field.key]} disabled={busy || ai.loading} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}/>}</label>)}</form> : <section><h3>Source content</h3><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.content || 'No source content was saved.'}</p>{item.category && <p>Category: {item.category}</p>}</section>}
      {confirmDelete && <section className="sr-alert" role="alert"><strong>Delete {item.title}?</strong><p>This removes the content record. Governed workflow records keep their existing rules.</p><button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete record'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel deletion</button></section>}
      {ai.notice && <p className="sr-notice" role="status">{ai.notice}</p>}<AIResultView result={item.ai_output || item.aiOutput} model={provider?.model} tokens={provider?.usage} loading={ai.loading} error={ai.error} title={`${label} · AI draft`}/>
    </>}
  </NativeDialog>;
}
