'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PDFDocument = require('pdfkit');

const enabled = process.env.RUN_DATABASE_TESTS === '1';

function makePdf(pageTexts) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    for (const text of pageTexts) { pdf.addPage(); if (text) pdf.text(text); }
    pdf.end();
  });
}

async function makeScannedPdf(text) {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'content-ocr-http-'));
  try {
    const original = path.join(directory, 'text.pdf');
    const stem = path.join(directory, 'page');
    await fsPromises.writeFile(original, await makePdf([text]));
    await promisify(execFile)('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '1800', '-png', original, stem]);
    return await new Promise((resolve, reject) => {
      const pdf = new PDFDocument();
      const chunks = [];
      pdf.on('data', chunk => chunks.push(chunk));
      pdf.on('error', reject);
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.image(`${stem}.png`, 30, 30, { width: 550 });
      pdf.end();
    });
  } finally { await fsPromises.rm(directory, { recursive: true, force: true }); }
}

test('stored PDF page text gates cited draft, independent review and publication', { skip: !enabled }, async () => {
  if (!new URL(process.env.DATABASE_URL).pathname.includes('inspection_test_'))
    throw Error('Dedicated test database required');
  process.env.JWT_SECRET = 'inspection-session-key';
  const jwt = require('jsonwebtoken');
  const express = require('express');
  const db = require('../db');
  const migrations = ['001_governed_content_workflow.sql', '007_source_snapshots_and_evidence.sql', '008_pdf_text_evidence.sql', '009_pdf_ocr_evidence.sql'];
  for (const file of migrations) await db.query(fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8'));
  const app = express();
  app.use(express.json());
  app.use('/workflow', require('../routes/workflow')(db));
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const author = jwt.sign({ id: 8101, role: 'author', tenantId: 'pdf-test-tenant' }, process.env.JWT_SECRET);
  const reviewer = jwt.sign({ id: 8102, role: 'publisher', tenantId: 'pdf-test-tenant' }, process.env.JWT_SECRET);
  const outsider = jwt.sign({ id: 9101, role: 'publisher', tenantId: 'other-tenant' }, process.env.JWT_SECRET);
  const call = async (url, token, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  try {
    const bytes = await makePdf(['First page context for the editor.', 'Second page quote supports the published claim.']);
    const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const sourceUri = 'https://example.test/source.pdf';
    const ingest = await call('/workflow/ingestions', author, {
      sourceUri, sourceSha256, rightsBasis: 'owned', rightsReference: 'test-rights-file',
      idempotencyKey: `pdf-${crypto.randomUUID()}`,
    });
    assert.equal(ingest.status, 201, JSON.stringify(ingest.body));
    const id = ingest.body.workflow.id;
    const sourceUrl = `/workflow/workflows/${id}/source`;
    const upload = await fetch(base + sourceUrl, {
      method: 'PUT',
      headers: { authorization: `Bearer ${author}`, 'content-type': 'application/octet-stream',
        'x-source-media-type': 'application/pdf', 'x-source-filename': 'source.pdf' },
      body: bytes,
    });
    assert.equal(upload.status, 201, await upload.text());
    const extractionUrl = `${sourceUrl}/pdf-text`;
    assert.equal((await call(extractionUrl, outsider, {})).status, 404);
    const extracted = await call(extractionUrl, author, {});
    assert.equal(extracted.status, 201, JSON.stringify(extracted.body));
    assert.equal(extracted.body.extraction.pages.length, 2);
    assert.equal((await call(extractionUrl, author, {})).body.replayed, true);
    const detail = await call(`/workflow/workflows/${id}`, reviewer);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.source.source_extraction.textSha256, extracted.body.extraction.textSha256);
    assert.equal(detail.body.source.source_text.includes('Second page quote'), true);
    const pdfText = detail.body.source.source_text;
    const quote = 'Second page quote';
    const sourceStart = pdfText.indexOf(quote);
    const body = 'A draft claim about the original document needs independent review.';
    const span = { claimStart: 0, claimEnd: 13, claimText: body.slice(0, 13),
      sourceStart, sourceEnd: sourceStart + quote.length, sourceQuote: quote,
      sourceSha256, sourcePage: 2, sourceTextSha256: extracted.body.extraction.textSha256 };
    const variantUrl = `/workflow/workflows/${id}/variants`;
    const draftInput = { channel: 'web', body, sourceCitations: [`${sourceUri}#page=2`], evidenceSpans: [span] };
    assert.equal((await call(variantUrl, author, { ...draftInput, evidenceSpans: [{ ...span, sourcePage: 1 }] })).status, 422);
    assert.equal((await call(variantUrl, author, { ...draftInput, sourceCitations: [`${sourceUri}#page=1`] })).status, 422);
    const draft = await call(variantUrl, author, draftInput);
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal(draft.body.variant.evidence_spans[0].sourcePage, 2);
    const review = await call(`${variantUrl}/${draft.body.variant.id}/decision`, reviewer,
      { decision: 'approved', rationale: 'Checked page 2 against the original PDF',
        brandPassed: true, accessibilityPassed: true, sourceReviewConfirmed: true, factualFidelity: 0.95 });
    assert.equal(review.status, 200, JSON.stringify(review.body));
    assert.equal((await call(`/workflow/workflows/${id}/submit`, author, {})).status, 200);
    assert.equal((await call(`/workflow/workflows/${id}/approvals`, reviewer,
      { decision: 'approved', rationale: 'Source and rights reviewed' })).status, 201);
    const transition = to => call(`/workflow/workflows/${id}/transitions`, reviewer,
      { to, reason: `Verified transition to ${to}`, correlationId: crypto.randomUUID() });
    assert.equal((await transition('approved')).status, 200);
    assert.equal((await transition('scheduled')).status, 200);
    assert.equal((await transition('published')).status, 200);
    await assert.rejects(db.query('DELETE FROM content_pdf_text_evidence WHERE workflow_id=$1', [id]), /immutable/);
    await assert.rejects(db.query('UPDATE content_pdf_text_evidence SET extracted_text=$1 WHERE workflow_id=$2', ['fake', id]), /immutable/);
    assert.equal((await call(`/workflow/workflows/${id}`, outsider)).status, 404);

    const scanBytes = await makeScannedPdf('OCR source statement supports this claim.');
    const scanSha256 = crypto.createHash('sha256').update(scanBytes).digest('hex');
    const scanned = await call('/workflow/ingestions', author, {
      sourceUri: 'https://example.test/scanned.pdf', sourceSha256: scanSha256,
      rightsBasis: 'owned', rightsReference: 'test-scanned-rights', idempotencyKey: `ocr-${crypto.randomUUID()}`,
    });
    assert.equal(scanned.status, 201, JSON.stringify(scanned.body));
    const scanId = scanned.body.workflow.id;
    const scanUpload = await fetch(base + `/workflow/workflows/${scanId}/source`, {
      method: 'PUT', headers: { authorization: `Bearer ${author}`, 'content-type': 'application/octet-stream',
        'x-source-media-type': 'application/pdf', 'x-source-filename': 'scanned.pdf' }, body: scanBytes,
    });
    assert.equal(scanUpload.status, 201, await scanUpload.text());
    const scanExtraction = await call(`/workflow/workflows/${scanId}/source/pdf-text`, author, {});
    assert.equal(scanExtraction.status, 201, JSON.stringify(scanExtraction.body));
    assert.equal(scanExtraction.body.extraction.method, 'tesseract_pdf_pages_v1');
    assert.equal(scanExtraction.body.extraction.pages[0].recognition, 'ocr');
    const scanDetail = await call(`/workflow/workflows/${scanId}`, reviewer);
    assert.match(scanDetail.body.source.source_text, /OCR source statement supports this claim/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
});
