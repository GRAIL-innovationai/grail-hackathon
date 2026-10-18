'use strict';

function reply(message) {
  if (process.connected) process.send(message, () => process.disconnect());
}

async function extract(data) {
  const bytes = Buffer.from(data.bytes);
  if (data.ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value;
  }
  if (data.ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true });
    try {
      const result = await parser.getText({ pageJoiner: '' });
      return result.text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  throw new Error('Unsupported format');
}

process.once('message', data => {
  extract(data).then(text => {
    if (typeof text !== 'string' || !text.trim()) { reply({ ok: true, text: '' }); return; }
    if (text.length > 20000) { reply({ ok: false, reason: 'TOO_LARGE' }); return; }
    reply({ ok: true, text });
  }).catch(() => reply({ ok: false }));
});
