BEGIN;

ALTER TABLE content_pdf_text_evidence
  DROP CONSTRAINT IF EXISTS content_pdf_text_evidence_extraction_method_check;
ALTER TABLE content_pdf_text_evidence
  ADD CONSTRAINT content_pdf_text_evidence_extraction_method_check
  CHECK (extraction_method IN ('pdftotext_utf8_v1', 'tesseract_pdf_pages_v1'));

COMMIT;
