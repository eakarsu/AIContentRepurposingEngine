import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Navbar from '../components/Navbar';
import './GovernedWorkflow.css';

const CHANNELS = ['web', 'email', 'linkedin', 'instagram', 'youtube', 'podcast', 'short_video'];
const FEATURE = { web: 'content_summaries', email: 'email_newsletters', linkedin: 'blog_to_social', instagram: 'blog_to_social', youtube: 'youtube_descriptions', podcast: 'podcast_notes', short_video: 'video_scripts' };
const stateLabel = state => String(state || '').replaceAll('_', ' ');
const errorText = error => error.response?.data?.error || error.message;

export default function GovernedWorkflow() {
  const [identity, setIdentity] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState({ sourceUri: '', rightsBasis: 'owned', rightsReference: '' });
  const [sourceFile, setSourceFile] = useState(null);
  const [existingSourceFile, setExistingSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [draft, setDraft] = useState({ channel: 'web', title: '', excerpt: '', body: '', citations: '', evidenceSpans: [] });
  const [reviewChecks, setReviewChecks] = useState({ brandPassed: false, accessibilityPassed: false, factualFidelity: '', sourceReviewConfirmed: false });
  const sourceTextRef = useRef(null);
  const draftBodyRef = useRef(null);
  const registerFileRef = useRef(null);
  const existingFileRef = useRef(null);
  const [rationale, setRationale] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState({ wordpressConfigured: false });
  const [receipt, setReceipt] = useState(null);
  const [performance, setPerformance] = useState({ observedAt: '', sourceUri: '', sourceSha256: '', views: '', clicks: '', engagements: '', conversions: '', reviewNote: '' });

  const request = useCallback((method, path, data, user = identity, extraHeaders = {}) => axios({
    method, url: `/api/workflow${path}`, data,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'X-Tenant-Id': user?.tenant_id || user?.tenantId || '',
      ...extraHeaders,
    },
  }), [identity]);

  const loadList = useCallback(async (user = identity) => {
    if (!user) return;
    try {
      const response = await request('get', '/workflows', undefined, user);
      setItems(Array.isArray(response.data.items) ? response.data.items : []);
      setError('');
    } catch (err) { setError(errorText(err)); }
  }, [identity, request]);

  useEffect(() => {
    let live = true;
    axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(response => { if (live) setIdentity(response.data.user); })
      .catch(err => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!identity) return;
    request('get', '/delivery-status').then(response => setDeliveryStatus(response.data)).catch(err => setError(errorText(err)));
  }, [identity, request]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function openWorkflow(id) {
    setBusy(true); setError('');
    try {
      const response = await request('get', `/workflows/${id}`);
      setSelected(response.data);
      if (selected?.workflow?.id !== id) {
        setDraft({ channel: 'web', title: '', excerpt: '', body: '', citations: '', evidenceSpans: [] });
        setPreviewUrl(null);
      }
      setReceipt(null);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function run(operation, success) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(success); await loadList(); if (selected) await openWorkflow(selected.workflow.id); return true; }
    catch (err) { setError(errorText(err)); return false; }
    finally { setBusy(false); }
  }

  async function ingest(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    let registeredId = null;
    try {
      if (!sourceFile) throw new Error('Select the rights-cleared source file.');
      const bytes = await sourceFile.arrayBuffer();
      const digest = [...new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      const response = await request('post', '/ingestions', { ...source, sourceSha256: digest, idempotencyKey: window.crypto.randomUUID(), sourceMetadata: { uploadedFilename: sourceFile.name } });
      registeredId = response.data.workflow.id;
      await uploadFile(response.data.workflow.id, sourceFile, bytes);
      setSource({ sourceUri: '', rightsBasis: 'owned', rightsReference: '' });
      setSourceFile(null);
      if (registerFileRef.current) registerFileRef.current.value = '';
      setNotice('Source bytes stored with a verified SHA-256. The reference URL and rights basis are operator supplied.');
      await loadList();
      await openWorkflow(response.data.workflow.id);
    } catch (err) { const message = errorText(err); if (registeredId) { await loadList(); await openWorkflow(registeredId); } setError(message); }
    finally { setBusy(false); }
  }

  async function uploadFile(workflowId, file, bytes) {
    const lowerName = file.name.toLowerCase();
    const mediaType = lowerName.endsWith('.md') ? 'text/markdown' : lowerName.endsWith('.txt') ? 'text/plain' : file.type;
    await request('put', `/workflows/${workflowId}/source`, bytes, identity, {
      'Content-Type': 'application/octet-stream', 'X-Source-Media-Type': mediaType,
      'X-Source-Filename': file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'source',
    });
  }

  async function uploadExisting() {
    if (!selected || !existingSourceFile) { setError('Select the matching source file.'); return; }
    const saved = await run(() => uploadFile(selected.workflow.id, existingSourceFile, existingSourceFile), 'Stored the matching source snapshot.');
    if (saved) { setExistingSourceFile(null); if (existingFileRef.current) existingFileRef.current.value = ''; }
  }

  function useSelectedExcerpt() {
    const field = sourceTextRef.current;
    if (!field || field.selectionEnd <= field.selectionStart) { setError('Select text in the stored source first.'); return; }
    setDraft(current => ({ ...current, excerpt: field.value.slice(field.selectionStart, field.selectionEnd) }));
    setError('');
  }

  function addEvidenceSpan() {
    const sourceField = sourceTextRef.current, bodyField = draftBodyRef.current;
    if (!sourceField || !bodyField || sourceField.selectionEnd <= sourceField.selectionStart || bodyField.selectionEnd <= bodyField.selectionStart) {
      setError('Select one claim in the draft and one supporting quote in the stored source.'); return;
    }
    const extraction = selected.source.source_extraction;
    const page = extraction?.pages.find(item => sourceField.selectionStart >= item.start && sourceField.selectionEnd <= item.end);
    if (extraction && !page) { setError('Select a quote within one extracted PDF page.'); return; }
    const span = {
      claimStart: bodyField.selectionStart, claimEnd: bodyField.selectionEnd,
      claimText: bodyField.value.slice(bodyField.selectionStart, bodyField.selectionEnd),
      sourceStart: sourceField.selectionStart, sourceEnd: sourceField.selectionEnd,
      sourceQuote: sourceField.value.slice(sourceField.selectionStart, sourceField.selectionEnd),
      sourceSha256: selected.source.source_sha256,
      ...(page ? { sourcePage: page.page, sourceTextSha256: extraction.textSha256 } : {}),
    };
    setDraft(current => {
      const citation = page ? new URL(selected.workflow.source_uri) : null;
      if (citation) citation.hash = `page=${page.page}`;
      const citations = current.citations.split('\n').map(value => value.trim()).filter(Boolean);
      if (citation && !citations.includes(citation.href)) citations.push(citation.href);
      return { ...current, citations: citations.join('\n'), evidenceSpans: [...current.evidenceSpans, span] };
    });
    setError('');
  }

  async function extractPdfText() {
    if (!selected) return;
    await run(() => request('post', `/workflows/${selected.workflow.id}/source/pdf-text`, {}),
      'PDF text stored with the original file hash and page offsets. Review every quote against the PDF, especially OCR pages.');
  }

  async function downloadSource() {
    if (!selected) return;
    try {
      const response = await axios.get(`/api/workflow/workflows/${selected.workflow.id}/source`, {
        responseType: 'blob', headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'X-Tenant-Id': identity?.tenant_id || identity?.tenantId || '' },
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = selected.source.filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(errorText(err)); }
  }

  async function showImagePreview() {
    if (!selected?.source?.media_type?.startsWith('image/')) return;
    try {
      const response = await axios.get(`/api/workflow/workflows/${selected.workflow.id}/source`, {
        responseType: 'blob', headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'X-Tenant-Id': identity?.tenant_id || identity?.tenantId || '' },
      });
      setPreviewUrl(URL.createObjectURL(response.data));
    } catch (err) { setError(errorText(err)); }
  }

  async function suggestDraft() {
    if (!selected?.source?.source_text || !draft.excerpt.trim() || !draft.title.trim()) { setError('Select an excerpt from the stored text and add a title before requesting an AI draft.'); return; }
    setBusy(true); setError('');
    try {
      const response = await axios.post('/api/ai/generate', {
        feature: FEATURE[draft.channel], title: draft.title, content: draft.excerpt,
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setDraft(current => ({ ...current, body: String(response.data.ai_output || ''), evidenceSpans: [] }));
      setNotice('AI draft is advisory. Check every claim against the source, add citations, and record your own brand, accessibility, and fidelity review.');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function saveVariant(event) {
    event.preventDefault();
    if (!selected) return;
    const citations = draft.citations.split('\n').map(value => value.trim()).filter(Boolean);
    if (!citations.length) { setError('Add at least one source citation.'); return; }
    await run(() => request('post', `/workflows/${selected.workflow.id}/variants`, {
      channel: draft.channel, body: draft.body, sourceCitations: citations, evidenceSpans: draft.evidenceSpans,
    }), 'Draft saved for independent review.');
  }

  async function decideVariant(variant, decision) {
    if (!rationale.trim()) { setError('Enter a review rationale.'); return; }
    const saved = await run(() => request('post', `/workflows/${selected.workflow.id}/variants/${variant.id}/decision`, {
      decision, rationale: rationale.trim(),
      ...(decision === 'approved' ? { brandPassed: reviewChecks.brandPassed, accessibilityPassed: reviewChecks.accessibilityPassed, sourceReviewConfirmed: reviewChecks.sourceReviewConfirmed, factualFidelity: Number(reviewChecks.factualFidelity) / 100 } : {}),
    }), 'Variant decision recorded.');
    if (saved) { setRationale(''); setReviewChecks({ brandPassed: false, accessibilityPassed: false, factualFidelity: '', sourceReviewConfirmed: false }); }
  }

  async function submit() {
    await run(() => request('post', `/workflows/${selected.workflow.id}/submit`, {}), 'Workflow submitted for review.');
  }

  async function approve(decision) {
    if (!rationale.trim()) { setError('Enter a review rationale.'); return; }
    await run(() => request('post', `/workflows/${selected.workflow.id}/approvals`, { decision, rationale: rationale.trim() }), 'Approval decision recorded.');
    setRationale('');
  }

  async function transition(to) {
    if (!rationale.trim()) { setError('Enter a transition reason.'); return; }
    await run(() => request('post', `/workflows/${selected.workflow.id}/transitions`, { to, reason: rationale.trim(), correlationId: window.crypto.randomUUID() }), `Workflow moved to ${stateLabel(to)}.`);
    setRationale('');
  }

  async function deliver(job) {
    await run(() => request('post', `/outbox/${job.id}/deliver`, {}), 'WordPress confirmed delivery. Open the provider receipt to verify the post.');
  }

  async function viewReceipt(job) {
    setBusy(true); setError('');
    try { const response = await request('get', `/outbox/${job.id}/receipt`); setReceipt(response.data.receipt); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function savePerformance(event) {
    event.preventDefault();
    const metrics = Object.fromEntries(['views', 'clicks', 'engagements', 'conversions'].filter(key => performance[key] !== '').map(key => [key, Number(performance[key])]));
    await run(() => request('post', `/workflows/${selected.workflow.id}/performance`, {
      observedAt: new Date(performance.observedAt).toISOString(), sourceUri: performance.sourceUri,
      sourceSha256: performance.sourceSha256, metrics, reviewNote: performance.reviewNote,
    }), 'Operator-entered performance snapshot saved with a source reference. Provider metric authenticity remains unverified.');
  }

  const state = selected?.workflow?.state;
  const nextStates = ({ in_review: ['approved', 'drafted'], approved: ['scheduled', 'correction_required'], scheduled: ['published', 'correction_required'], published: ['correction_required', 'archived'], correction_required: ['drafted', 'archived'] })[state] || [];

  return <div className="governed-content-page">
    <Navbar breadcrumbs={[{ label: 'Governed Content' }]} />
    <main className="governed-content-body">
      <h2>Governed content workflow</h2>
      <p>Register a rights-cleared source and upload its bytes, draft with exact source spans, get an independent review, and track approval. The source URL and rights statement are supplied by the operator. Publishing creates an outbox job; no destination delivery is claimed until a provider receipt is recorded.</p>
      {identity && <p>Workspace: <strong>{identity.tenant_id}</strong> · Role: {identity.role}</p>}
      {error && <p role="alert" className="governed-content-error">{error}</p>}
      {notice && <p role="status" className="governed-content-notice">{notice}</p>}
      <div className="governed-content-grid">
        <section>
          <h3>Register source</h3>
          <form onSubmit={ingest}>
            <label>Source reference URL (operator supplied) <input type="text" required value={source.sourceUri} onChange={event => setSource({ ...source, sourceUri: event.target.value })} placeholder="https://…, s3://…, or gs://…" /></label>
            <label>Rights-cleared source file <input ref={registerFileRef} type="file" required accept=".txt,.md,.pdf,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={event => setSourceFile(event.target.files?.[0] || null)} /></label>
            <label>Rights basis <select value={source.rightsBasis} onChange={event => setSource({ ...source, rightsBasis: event.target.value })}>{['owned', 'licensed', 'public_domain', 'permission'].map(value => <option key={value} value={value}>{stateLabel(value)}</option>)}</select></label>
            <label>Rights evidence reference <input required value={source.rightsReference} onChange={event => setSource({ ...source, rightsReference: event.target.value })} /></label>
            <button disabled={busy || !identity || !sourceFile}>Register and upload source</button>
          </form>
          <h3>Workflows</h3>
          <ul className="governed-content-list">{items.map(item => <li key={item.id}><button type="button" onClick={() => openWorkflow(item.id)}>{item.source_uri}<small>{stateLabel(item.state)} · {new Date(item.updated_at).toLocaleString()}</small></button></li>)}</ul>
          {!items.length && <p>No governed sources registered yet.</p>}
        </section>
        <section>
          <h3>Source and variants</h3>
          {!selected ? <p>Choose a workflow to draft and review.</p> : <>
            <p><strong>{selected.workflow.source_uri}</strong><br />State: {stateLabel(state)} · Rights: {stateLabel(selected.workflow.rights_basis)}</p>
            {selected.source ? <div className="governed-content-source">
              <p><strong>Stored source:</strong> {selected.source.filename} · {selected.source.media_type} · {selected.source.byte_length} bytes · SHA-256 <code>{selected.source.source_sha256}</code></p>
              <button type="button" disabled={busy} onClick={downloadSource}>Download exact stored bytes</button>
              {selected.source.media_type.startsWith('image/') && <><button type="button" disabled={busy} onClick={showImagePreview}>Preview image</button>{previewUrl && <img className="governed-content-image-preview" src={previewUrl} alt="Uploaded source preview" />}</>}
              {selected.source.media_type === 'application/pdf' && !selected.source.source_extraction && <><button type="button" disabled={busy || state !== 'ingested' || (selected.variants || []).length > 0} onClick={extractPdfText}>Extract PDF text</button><p>Text-layer and scanned-page OCR extraction are available before drafting. Inspect recognized text against the original.</p></>}
              {selected.source.source_extraction && <p>PDF extraction: {selected.source.source_extraction.pages.length} page(s) · text SHA-256 <code>{selected.source.source_extraction.textSha256}</code>. Page offsets: {selected.source.source_extraction.pages.map(page => `page ${page.page} (${page.recognition || 'text layer'}): ${page.start}–${page.end}`).join('; ')}. Check extracted text against the original PDF, especially OCR pages.</p>}
              {selected.source.source_text !== null ? <><label>{selected.source.source_extraction ? 'Extracted PDF text' : 'Stored text'} (select a supporting quote here)<textarea ref={sourceTextRef} readOnly value={selected.source.source_text} rows="12" /></label><button type="button" onClick={useSelectedExcerpt}>Use selection for AI suggestion</button></> : <p>Binary source: download and inspect it. Automated text span evidence is unavailable for this format.</p>}
            </div> : <div className="governed-content-source"><p>This registered source has no uploaded snapshot yet. Drafting and publication are blocked until matching bytes are stored.</p><label>Matching source file<input ref={existingFileRef} type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg" onChange={event => setExistingSourceFile(event.target.files?.[0] || null)} /></label><button type="button" disabled={busy || !existingSourceFile} onClick={uploadExisting}>Upload matching bytes</button></div>}
            <h4>Create a cited draft</h4>
            <form onSubmit={saveVariant}>
              <label>Channel <select value={draft.channel} onChange={event => setDraft({ ...draft, channel: event.target.value })}>{CHANNELS.map(channel => <option key={channel}>{channel}</option>)}</select></label>
              <label>Source title <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Selected stored-source excerpt <textarea readOnly value={draft.excerpt} /></label>
              <button type="button" disabled={busy || !draft.excerpt.trim()} onClick={suggestDraft}>Suggest AI draft</button>
              <label>Draft body (select a claim here)<textarea ref={draftBodyRef} required minLength="20" value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value, evidenceSpans: [] })} /></label>
              {selected.source && selected.source.source_text !== null && <><button type="button" disabled={busy} onClick={addEvidenceSpan}>Add selected claim → source quote</button><p>Exact evidence spans: {draft.evidenceSpans.length}</p>{draft.evidenceSpans.map((span, index) => <p key={`${span.claimStart}-${span.sourceStart}-${index}`} className="governed-content-span"><strong>Claim:</strong> {span.claimText}<br /><strong>Stored quote{span.sourcePage ? ` (PDF page ${span.sourcePage})` : ''}:</strong> {span.sourceQuote} <button type="button" onClick={() => setDraft(current => ({ ...current, evidenceSpans: current.evidenceSpans.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></p>)}</>}
              <label>Source citations, one per line <textarea required value={draft.citations} onChange={event => setDraft({ ...draft, citations: event.target.value })} placeholder={`${selected.workflow.source_uri}#section-1`} /></label>
              <button disabled={busy || !identity || !selected.source || (selected.source.source_text !== null && !draft.evidenceSpans.length)}>Save draft for review</button>
            </form>
            <h4>Variants</h4>
            {(selected.variants || []).map(variant => <article key={variant.id} className="governed-content-variant"><strong>{variant.channel} · {variant.status}</strong><p>{variant.body}</p><small>Citations: {(variant.source_citations || []).join(', ')}</small>{(variant.evidence_spans || []).map((span, index) => <p key={index} className="governed-content-span"><strong>Claim [{span.claimStart}–{span.claimEnd}]:</strong> {span.claimText}<br /><strong>Source quote{span.sourcePage ? `, PDF page ${span.sourcePage}` : ''} [{span.sourceStart}–{span.sourceEnd}]:</strong> {span.sourceQuote}<br /><small>Source SHA-256 {span.sourceSha256}{span.sourceTextSha256 ? ` · text SHA-256 ${span.sourceTextSha256}` : ''}</small></p>)}{variant.status === 'approved' && <p>Independent reviewer {variant.source_evaluation?.reviewedBy} confirmed stored-source evidence · fidelity {(Number(variant.factual_fidelity) * 100).toFixed(0)}%</p>}<div>{variant.status === 'draft' && <><button disabled={busy || String(variant.created_by) === String(identity?.id) || !reviewChecks.brandPassed || !reviewChecks.accessibilityPassed || !reviewChecks.sourceReviewConfirmed || Number(reviewChecks.factualFidelity) < 90 || !rationale.trim()} onClick={() => decideVariant(variant, 'approved')}>Approve variant</button><button disabled={busy || !rationale.trim()} onClick={() => decideVariant(variant, 'rejected')}>Reject variant</button></>}</div></article>)}
            <h4>Review and approval</h4>
            <label>Review rationale <textarea value={rationale} onChange={event => setRationale(event.target.value)} /></label>
            {(selected.variants || []).some(variant => variant.status === 'draft') && <div><p>For an approval, an independent editor checks the stored source, each shown claim and quote, brand rules, and accessibility. This is a human judgment, not automated proof of truth.</p><label><input type="checkbox" checked={reviewChecks.sourceReviewConfirmed} onChange={event => setReviewChecks({ ...reviewChecks, sourceReviewConfirmed: event.target.checked })} /> I inspected the stored source and confirm the cited evidence supports this variant</label><label><input type="checkbox" checked={reviewChecks.brandPassed} onChange={event => setReviewChecks({ ...reviewChecks, brandPassed: event.target.checked })} /> Brand rules checked</label><label><input type="checkbox" checked={reviewChecks.accessibilityPassed} onChange={event => setReviewChecks({ ...reviewChecks, accessibilityPassed: event.target.checked })} /> Accessibility checked</label><label>Reviewer factual fidelity (%) <input type="number" min="90" max="100" step="1" value={reviewChecks.factualFidelity} onChange={event => setReviewChecks({ ...reviewChecks, factualFidelity: event.target.value })} /></label></div>}
            {state === 'drafted' && <button disabled={busy} onClick={submit}>Submit for review</button>}
            {state === 'in_review' && <><button disabled={busy} onClick={() => approve('approved')}>Record approval</button><button disabled={busy} onClick={() => approve('rejected')}>Record rejection</button></>}
            <div className="governed-content-actions">{nextStates.map(next => <button key={next} disabled={busy || !rationale.trim()} onClick={() => transition(next)}>{next === 'published' ? 'Queue publication (no delivery yet)' : `Move to ${stateLabel(next)}`}</button>)}</div>
            <h4>Publication outbox</h4>
            <p>WordPress web delivery: {deliveryStatus.wordpressConfigured ? 'configured' : 'not configured'}. Delivery needs a publisher and a provider receipt.</p>
            {(selected.outbox || []).length ? <ul>{selected.outbox.map(job => <li key={job.id}>{job.provider}: {job.status}{job.provider_reference ? ` · provider ID ${job.provider_reference}` : ''}{job.last_error_code ? ` · ${job.last_error_code}` : ''} {job.status === 'delivered' && <button disabled={busy} onClick={() => viewReceipt(job)}>View receipt</button>}{job.provider === 'web' && ['pending', 'failed'].includes(job.status) && deliveryStatus.wordpressConfigured && ['publisher', 'admin'].includes(identity?.role) && <button disabled={busy} onClick={() => deliver(job)}>Deliver to WordPress</button>}</li>)}</ul> : <p>No delivery jobs.</p>}
            {receipt && <p role="status">WordPress receipt: {receipt.provider_id} · {receipt.published_status} · {new Date(receipt.delivered_at).toLocaleString()} {receipt.provider_url && <a href={receipt.provider_url} target="_blank" rel="noopener noreferrer">Open post</a>}</p>}
            <h4>Measured performance evidence</h4>
            {(selected.performance || []).length ? <ul>{selected.performance.map(snapshot => <li key={snapshot.id}>{new Date(snapshot.observed_at).toLocaleString()} · {Object.entries(snapshot.metrics || {}).map(([key, value]) => `${key}: ${value}`).join(', ')} · source SHA {snapshot.source_sha256?.slice(0, 12) || 'unrecorded'}…</li>)}</ul> : <p>No measured performance imported.</p>}
            {(selected.outbox || []).some(job => job.status === 'delivered') && ['publisher', 'admin'].includes(identity?.role) && <form onSubmit={savePerformance}>
              <p>Import counts from an analytics report after checking its source. This is an operator record, not automatic provider verification.</p>
              <label>Observed at<input required type="datetime-local" value={performance.observedAt} onChange={event => setPerformance({ ...performance, observedAt: event.target.value })} /></label>
              <label>HTTPS analytics report URL<input required type="url" value={performance.sourceUri} onChange={event => setPerformance({ ...performance, sourceUri: event.target.value })} /></label>
              <label>Report SHA-256<input required pattern="[a-fA-F0-9]{64}" value={performance.sourceSha256} onChange={event => setPerformance({ ...performance, sourceSha256: event.target.value })} /></label>
              {['views', 'clicks', 'engagements', 'conversions'].map(key => <label key={key}>{key}<input type="number" min="0" step="1" value={performance[key]} onChange={event => setPerformance({ ...performance, [key]: event.target.value })} /></label>)}
              <label>Operator review note<textarea required value={performance.reviewNote} onChange={event => setPerformance({ ...performance, reviewNote: event.target.value })} /></label>
              <button disabled={busy}>Save performance evidence</button>
            </form>}
          </>}
        </section>
      </div>
    </main>
  </div>;
}
