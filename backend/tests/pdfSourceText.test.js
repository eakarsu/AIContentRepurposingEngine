'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PDFDocument = require('pdfkit');
const { extractPdfTextLayer, verifiedPdfExtraction } = require('../services/pdfSourceText');
const workflow = require('../services/contentWorkflow');

function makePdf(pageTexts) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    for (const text of pageTexts) {
      pdf.addPage();
      if (text) pdf.text(text);
    }
    pdf.end();
  });
}

async function makeScannedPdf(text) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'content-ocr-fixture-'));
  try {
    const textPdf = path.join(directory, 'text.pdf');
    const imageStem = path.join(directory, 'page');
    await fs.writeFile(textPdf, await makePdf([text]));
    await promisify(execFile)('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '1800', '-png', textPdf, imageStem]);
    return await new Promise((resolve, reject) => {
      const pdf = new PDFDocument();
      const chunks = [];
      pdf.on('data', chunk => chunks.push(chunk));
      pdf.on('error', reject);
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.image(`${imageStem}.png`, 30, 30, { width: 550 });
      pdf.end();
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test('PDF text quotes are bound to their stored page and both source digests', async () => {
  const bytes = await makePdf(['First page context for the editor.', 'Second page quote supports the claim.']);
  const result = await extractPdfTextLayer(bytes);
  const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(result.pageCount, 2);
  assert.equal(result.text.slice(result.pages[1].start, result.pages[1].end), 'Second page quote supports the claim.');
  const snapshot = { media_type: 'application/pdf', source_bytes: bytes };
  const row = {
    extraction_method: result.method, source_sha256: sourceSha256,
    text_sha256: result.textSha256, page_count: result.pageCount,
    page_spans: result.pages, extracted_text: result.text,
  };
  assert.equal(verifiedPdfExtraction(snapshot, row).text, result.text);
  assert.throws(() => verifiedPdfExtraction(snapshot, { ...row, extracted_text: 'changed' }), /does not match/);
  assert.throws(() => verifiedPdfExtraction(snapshot, { ...row, page_spans: [{ page: 1, start: 0, end: 2 }, result.pages[1]] }), /page (offsets|separator)/);

  const body = 'A claim on the second page is supported by the stored document.';
  const quote = 'Second page quote';
  const sourceStart = result.text.indexOf(quote);
  const span = {
    claimStart: 0, claimEnd: 7, claimText: 'A claim',
    sourceStart, sourceEnd: sourceStart + quote.length, sourceQuote: quote,
    sourceSha256, sourcePage: 2, sourceTextSha256: result.textSha256,
  };
  const extraction = { pages: result.pages, textSha256: result.textSha256 };
  const stored = workflow.validateEvidenceSpans(body, result.text, sourceSha256, [span], extraction);
  assert.equal(stored[0].sourcePage, 2);
  assert.equal(workflow.validatePdfPageCitations('https://example.test/source.pdf',
    ['https://example.test/source.pdf#page=2'], stored, extraction), true);
  assert.throws(() => workflow.validateEvidenceSpans(body, result.text, sourceSha256,
    [{ ...span, sourcePage: 1 }], extraction), /within its cited page/);
  assert.throws(() => workflow.validateEvidenceSpans(body, result.text, sourceSha256,
    [{ ...span, sourceTextSha256: 'a'.repeat(64) }], extraction), /text digest/);
  assert.throws(() => workflow.validatePdfPageCitations('https://example.test/source.pdf',
    ['https://example.test/source.pdf#page=1'], stored, extraction), /exact page citation/);
});

test('scanned PDF text is page-bound and explicitly marked as OCR', async () => {
  const bytes = await makeScannedPdf('OCR source statement supports this claim.');
  const result = await extractPdfTextLayer(bytes);
  assert.equal(result.method, 'tesseract_pdf_pages_v1');
  assert.equal(result.pages[0].recognition, 'ocr');
  assert.match(result.text, /OCR source statement supports this claim/i);
  const row = { extraction_method: result.method, source_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    text_sha256: result.textSha256, page_count: result.pageCount, page_spans: result.pages, extracted_text: result.text };
  assert.equal(verifiedPdfExtraction({ media_type: 'application/pdf', source_bytes: bytes }, row).text, result.text);
});

test('blank and oversized PDFs stay on the manual review path', async () => {
  const blank = await makePdf(['']);
  await assert.rejects(extractPdfTextLayer(blank), /No selectable or OCR PDF text/);
  const tooMany = await makePdf(['one', 'two', 'three', 'four', 'five', 'six']);
  await assert.rejects(extractPdfTextLayer(tooMany), /1 to 5 pages/);
});
