'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { extractResume, MAX_BYTES } = require('./resume.cjs');

const encode = value => Buffer.from(value).toString('base64');

async function docx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function pdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let source = '%PDF-1.4\n', offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(source)); source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(source); source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}

test('TXT and Markdown extract strict UTF-8 text without changing the filename', async () => {
  assert.deepEqual(await extractResume('resume.TXT', encode('\uFEFF  Resume text\n')), { text: 'Resume text', warning: '' });
  assert.equal((await extractResume('notes.md', encode('# Skills'))).text, '# Skills');
});

test('PDF is parsed locally by the bounded worker', async () => {
  const pdfResult = await extractResume('resume.pdf', encode(pdf('PDF resume text')));
  assert.match(pdfResult.text, /PDF resume text/);
  assert.equal(pdfResult.warning, '');
});

test('DOCX is parsed locally by the bounded worker', async () => {
  const docxBytes = await docx('DOCX resume text');
  const docxResult = await extractResume('resume.docx', encode(docxBytes));
  assert.match(docxResult.text, /DOCX resume text/);
});

test('image-only PDFs ask the user to paste readable resume text', async () => {
  await assert.rejects(extractResume('scan.pdf', encode(pdf(''))), /image-only document/);
});

test('bad filename, type, base64, binary text, empty text and oversize data are rejected safely', async () => {
  await assert.rejects(extractResume('../resume.txt', encode('abc')), { code: 'INVALID' });
  await assert.rejects(extractResume('resume.html', encode('abc')), { code: 'INVALID' });
  await assert.rejects(extractResume('resume.txt', 'YQ==='), { code: 'INVALID' });
  await assert.rejects(extractResume('resume.txt', encode('a\0b')), /binary/);
  await assert.rejects(extractResume('resume.txt', encode('   ')), /No readable text/);
  await assert.rejects(extractResume('resume.txt', encode('x'.repeat(20001))), /20,000 characters/);
  await assert.rejects(extractResume('resume.txt', encode(Buffer.alloc(MAX_BYTES + 1, 65))), /too large/);
  await assert.rejects(extractResume('resume.txt', encode(Buffer.from([0xff, 0xfe]))), /UTF-8/);
});

test('malformed documents and ZIP bombs produce bounded errors without exposing source data', async () => {
  await assert.rejects(extractResume('resume.pdf', encode(Buffer.from('not a pdf'))), error => error.code === 'INVALID' && !/not a pdf/i.test(error.message));
  await assert.rejects(extractResume('resume.docx', encode(Buffer.from('not a zip'))), error => error.code === 'INVALID' && !/not a zip/i.test(error.message));
  const bomb = await new JSZip().file('word/document.xml', 'x'.repeat(16 * 1024 * 1024 + 1)).generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(extractResume('resume.docx', encode(bomb)), /safe extraction limit/);
});
