'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 20000;
const TIMEOUT_MS = 10000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function invalid(message = 'Resume file is invalid.') {
  const error = new Error(message);
  error.code = 'INVALID';
  return error;
}

function validateFile(filename, base64) {
  if (typeof filename !== 'string' || filename.length < 1 || filename.length > 240 ||
      /[\\/\0-\x1f\x7f]/.test(filename) || filename === '.' || filename === '..') throw invalid('Choose a valid filename.');
  const ext = path.extname(filename).toLowerCase();
  if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) throw invalid('Use a PDF, DOCX, TXT, or Markdown resume file.');
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !BASE64.test(base64)) throw invalid('Resume upload is invalid or too large.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== base64) throw invalid('Resume upload is invalid or too large.');
  return { ext, bytes };
}

function decodeText(bytes) {
  if (bytes.includes(0)) throw invalid('This file looks binary. Upload a TXT or Markdown text file.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw invalid('Resume text must use UTF-8 encoding.'); }
  text = text.replace(/^\uFEFF/, '').trim();
  if (!text) throw invalid('No readable text was found. Paste the resume text instead.');
  if (text.length > MAX_TEXT) throw invalid('Resume text exceeds 20,000 characters.');
  return text;
}

function checkDocxZip(bytes) {
  const start = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= start; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0 || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length) throw invalid('This DOCX archive is invalid.');
  const disk = bytes.readUInt16LE(eocd + 4), centralDisk = bytes.readUInt16LE(eocd + 6);
  const entriesDisk = bytes.readUInt16LE(eocd + 8), entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12), centralOffset = bytes.readUInt32LE(eocd + 16);
  if (disk || centralDisk || entriesDisk !== entries || entries < 1 || entries > 1000 || entries === 0xffff ||
      centralSize === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralSize > eocd) {
    throw invalid('This DOCX archive uses an unsupported or unsafe ZIP layout.');
  }
  let cursor = centralOffset, totalUncompressed = 0, hasDocument = false;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > centralOffset + centralSize || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid('This DOCX archive is invalid.');
    const flags = bytes.readUInt16LE(cursor + 8), uncompressed = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42), end = cursor + 46 + nameLength + extraLength + commentLength;
    if (flags & 1 || uncompressed === 0xffffffff || localOffset === 0xffffffff || end > centralOffset + centralSize || localOffset >= centralOffset) {
      throw invalid('This DOCX archive uses an unsupported or unsafe ZIP entry.');
    }
    const extraEnd = cursor + 46 + nameLength + extraLength;
    let extra = cursor + 46 + nameLength;
    for (; extra + 4 <= extraEnd;) {
      const tag = bytes.readUInt16LE(extra), length = bytes.readUInt16LE(extra + 2);
      if (extra + 4 + length > extraEnd || tag === 0x0001) throw invalid('This DOCX archive uses an unsupported ZIP extension.');
      extra += 4 + length;
    }
    if (extra !== extraEnd) throw invalid('This DOCX archive is invalid.');
    totalUncompressed += uncompressed;
    if (totalUncompressed > 16 * 1024 * 1024) throw invalid('This DOCX file expands beyond the safe extraction limit.');
    if (bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength) === 'word/document.xml') hasDocument = true;
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize || !hasDocument) throw invalid('This file is not a valid Word document.');
}

function extractInWorker(ext, bytes) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'resume-worker.cjs'), [], {
      execArgv: ['--max-old-space-size=128', '--stack-size=8192'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced', windowsHide: true
    });
    let settled = false;
    const timer = setTimeout(() => finish(Object.assign(new Error('Resume extraction took too long.'), { code: 'TIMEOUT' }), true), TIMEOUT_MS);
    const finish = (error, kill = false, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (kill && child.connected) child.kill();
      if (error) reject(error); else resolve(value);
    };
    child.once('message', message => {
      if (!message || message.ok !== true || typeof message.text !== 'string') {
        return finish(invalid(message && message.reason === 'TOO_LARGE' ? 'Resume text exceeds 20,000 characters.' : 'Could not extract text from this resume.'), true);
      }
      finish(null, false, message.text);
    });
    child.once('error', () => finish(invalid('Could not extract text from this resume.'), true));
    child.once('exit', code => { if (!settled) finish(invalid('Could not extract text from this resume.'), true); });
    child.send({ ext, bytes: Uint8Array.from(bytes) }, error => { if (error) finish(invalid('Could not extract text from this resume.'), true); });
  });
}

async function extractResume(filename, base64) {
  const { ext, bytes } = validateFile(filename, base64);
  if (ext === '.txt' || ext === '.md') return { text: decodeText(bytes), warning: '' };
  if (ext === '.docx') checkDocxZip(bytes);
  if (ext === '.pdf' && (!bytes.subarray(0, 8).toString('ascii').startsWith('%PDF-') || !bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF')))) {
    throw invalid('This PDF file is invalid or incomplete.');
  }
  const text = (await extractInWorker(ext, bytes)).replace(/^\uFEFF/, '').trim();
  if (!text) throw invalid('No readable text was found. This may be an image-only document; paste the resume text instead.');
  if (text.length > MAX_TEXT) throw invalid('Resume text exceeds 20,000 characters.');
  return { text, warning: '' };
}

module.exports = { extractResume, MAX_BYTES, MAX_TEXT };
