import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import NativeDialog from './NativeDialog';
import ContentRecordDialog from './ContentRecordDialog';
import AIFieldPresets, { completeExample } from './AIFieldPresets';
import AIResultView from './AIResultView';
import useCancelableAI from './useCancelableAI';
import { contentFields, contentExamples } from './contentFields';

export default function CreateModal({ featureName, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', content: '', category: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [savedItem, setSavedItem] = useState(null); const [providerResponse, setProviderResponse] = useState(null);
  const alive = useRef(true); const ai = useCancelableAI();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const label = featureName.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const fields = contentFields(featureName); const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const close = () => { if (saving) return; ai.cancel(); onClose(); };
  async function saveDraft() {
    if (!form.title.trim()) { setError('Enter a title to save a draft.'); return; }
    setSaving(true); setError('');
    try { await axios.post(`/api/content/${featureName}`, { ...form, status: 'draft' }, { headers }); await onCreated(); toast.success('Draft saved'); onClose(); }
    catch (failure) { if (alive.current) setError(failure.response?.data?.error || failure.message || 'The draft could not be saved.'); }
    finally { if (alive.current) setSaving(false); }
  }
  async function generate() {
    if (!form.title.trim() || !form.content.trim()) { setError('Title and source content are required for AI generation.'); return; }
    setError('');
    const response = await ai.run(async (options) => {
      const result = await axios.post('/api/ai/generate-and-save', { feature: featureName, ...form }, { headers, ...options });
      if (!result.data.item?.id && !result.data.item?._id) throw new Error('The server did not return a saved content record.');
      return result.data;
    });
    if (response && alive.current) { await onCreated(); if (!alive.current) return; setProviderResponse(response); setSavedItem(response.item); toast.success('AI draft generated and saved'); }
  }
  if (savedItem) return <ContentRecordDialog featureName={featureName} itemId={savedItem.id || savedItem._id} providerResponse={providerResponse} onClose={onClose} onChanged={onCreated}/>;
  return <NativeDialog title={`Create ${label}`} onClose={close} busy={saving} actions={<><button type="button" className="btn btn-outline" disabled={saving || ai.loading} onClick={saveDraft}>{saving ? 'Saving…' : 'Save as Draft'}</button><button type="button" className="btn btn-gradient" disabled={saving || ai.loading} onClick={generate}>{ai.loading ? 'Preparing draft…' : 'Generate with OpenRouter'}</button>{ai.loading && <button type="button" className="btn btn-outline" onClick={ai.cancel}>Cancel AI request</button>}</>}>
    <AIFieldPresets fields={fields} samples={contentExamples} context={label} disabled={saving || ai.loading} onFill={(sample, index) => { setForm(completeExample(fields, sample, index, label, form)); setError(''); ai.setError(null); }}/>
    <div className="modal-body">{fields.map((field) => <label className="form-group" key={field.key}><span className="form-label">{field.label}{field.key === 'title' ? ' *' : field.key === 'content' ? ' · Required for AI' : ' · Optional'}</span>{field.type === 'textarea' ? <textarea className="form-textarea" rows={7} maxLength={50000} value={form[field.key]} disabled={saving || ai.loading} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}/> : <input className="form-input" maxLength={field.maxLength} value={form[field.key]} disabled={saving || ai.loading} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}/>}</label>)}</div>
    {error && <p className="sr-alert" role="alert">{error}</p>}{ai.notice && <p className="sr-notice" role="status">{ai.notice}</p>}<AIResultView loading={ai.loading} error={ai.error} title={`${label} draft`}/>
  </NativeDialog>;
}
