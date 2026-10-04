'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify, TextDecoder } = require('node:util');

const execute = promisify(execFile);
const MAX_PAGES = 5;
const MAX_TEXT_CHARS = 300000;
const METHOD = 'pdftotext_utf8_v1';
const OCR_METHOD = 'tesseract_pdf_pages_v1';

function pdfError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function run(program, args, timeout) {
  try {
    const result = await execute(program, args, { timeout, maxBuffer: 2 * 1024 * 1024, encoding: 'buffer' });
    return result.stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw pdfError('PDF text or OCR tools are unavailable on this host', 503);
    if (error.killed || error.code === 'ETIMEDOUT') throw pdfError('PDF text extraction timed out', 503);
    throw pdfError('Stored PDF could not be read by the local text extractor');
  }
}

async function extractPdfTextLayer(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes.length > 5 * 1024 * 1024 ||
      bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw pdfError('A stored PDF source of at most 5 MiB is required');
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pdf-text-'));
  try {
    const sourcePath = path.join(directory, 'source.pdf');
    await fs.writeFile(sourcePath, bytes, { mode: 0o600 });
    const info = (await run(process.env.CONTENT_PDFINFO_PATH || 'pdfinfo', [sourcePath], 10000)).toString('utf8');
    const match = /^Pages:\s*(\d+)\s*$/m.exec(info);
    const pageCount = Number(match?.[1]);
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES)
      throw pdfError(`PDF text extraction supports 1 to ${MAX_PAGES} pages`);
    const parts = [];
    const pages = [];
    let usedOcr = false;
    let offset = 0;
    for (let page = 1; page <= pageCount; page += 1) {
      const output = await run(process.env.CONTENT_PDFTOTEXT_PATH || 'pdftotext',
        ['-f', String(page), '-l', String(page), '-layout', '-enc', 'UTF-8', sourcePath, '-'], 10000);
      let pageText;
      try { pageText = new TextDecoder('utf-8', { fatal: true }).decode(output); }
      catch (_) { throw pdfError('PDF text layer is not valid UTF-8'); }
      pageText = pageText.replace(/\r\n?/g, '\n').replace(/\f+$/g, '').trim();
      let recognition = 'text_layer';
      if (!pageText) {
        const imageStem = path.join(directory, `page-${page}`);
        await run(process.env.CONTENT_PDFTOPPM_PATH || 'pdftoppm',
          ['-f', String(page), '-l', String(page), '-singlefile', '-scale-to', '1800', '-png', sourcePath, imageStem], 30000);
        const language = process.env.CONTENT_OCR_LANGUAGE || 'eng';
        if (!/^[A-Za-z0-9_+]{1,64}$/.test(language)) throw pdfError('PDF OCR language setting is invalid', 503);
        const recognized = await run(process.env.CONTENT_TESSERACT_PATH || 'tesseract',
          [`${imageStem}.png`, 'stdout', '-l', language], 30000);
        try { pageText = new TextDecoder('utf-8', { fatal: true }).decode(recognized); }
        catch (_) { throw pdfError('PDF OCR text is not valid UTF-8'); }
        pageText = pageText.replace(/\r\n?/g, '\n').replace(/\f+$/g, '').trim();
        recognition = 'ocr'; usedOcr = true;
      }
      if (/[\x00-\x08\x0B\x0E-\x1F]/.test(pageText))
        throw pdfError('PDF text layer contains unsupported control characters');
      if (page > 1) offset += 2;
      pages.push({ page, start: offset, end: offset + pageText.length, recognition });
      parts.push(pageText);
      offset += pageText.length;
      if (offset > MAX_TEXT_CHARS) throw pdfError('PDF text layer exceeds the 300,000 character limit');
    }
    const text = parts.join('\n\n');
    if (!text.trim()) throw pdfError('No selectable or OCR PDF text was found; download and review this source manually');
    return { text, textSha256: sha256(Buffer.from(text, 'utf8')), pageCount, pages,
      method: usedOcr ? OCR_METHOD : METHOD };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function verifiedPdfExtraction(snapshot, row) {
  if (!row) return null;
  const text = row.extracted_text;
  const pages = row.page_spans;
  const count = Number(row.page_count);
  if (snapshot.media_type !== 'application/pdf' || ![METHOD, OCR_METHOD].includes(row.extraction_method) ||
      String(row.source_sha256).trim() !== sha256(snapshot.source_bytes) ||
      typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS ||
      String(row.text_sha256).trim() !== sha256(Buffer.from(text, 'utf8')) ||
      !Number.isInteger(count) || count < 1 || count > MAX_PAGES ||
      !Array.isArray(pages) || pages.length !== count) {
    throw pdfError('Stored PDF text evidence does not match its original source', 409);
  }
  let nextStart = 0;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.page !== index + 1 || page.start !== nextStart ||
        (page.recognition !== undefined && !['ocr', 'text_layer'].includes(page.recognition)) ||
        !Number.isInteger(page.end) || page.end < page.start || page.end > text.length)
      throw pdfError('Stored PDF page offsets are invalid', 409);
    nextStart = page.end + (index < pages.length - 1 ? 2 : 0);
    if (index < pages.length - 1 && text.slice(page.end, nextStart) !== '\n\n')
      throw pdfError('Stored PDF page separator is invalid', 409);
  }
  if (nextStart !== text.length) throw pdfError('Stored PDF text length is invalid', 409);
  if (row.extraction_method === OCR_METHOD && !pages.some(page => page.recognition === 'ocr'))
    throw pdfError('Stored PDF OCR method does not match page evidence', 409);
  if (row.extraction_method === METHOD && pages.some(page => page.recognition === 'ocr'))
    throw pdfError('Stored PDF text-layer method does not match page evidence', 409);
  return { text, textSha256: String(row.text_sha256).trim(), method: METHOD, pages };
}

module.exports = { extractPdfTextLayer, verifiedPdfExtraction, pdfError };
