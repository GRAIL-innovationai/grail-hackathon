import { extractResumePdf } from '../shared/resume-pdf';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

/** Extract text locally; callers must show it for confirmation before saving or inference. */
export async function readResumePdf(path: string): Promise<{ text: string; pages: number }> {
  if (extname(path).toLowerCase() !== '.pdf') throw new Error('Choose a PDF resume.');
  const info = await stat(path);
  if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error('Choose a PDF file no larger than 5 MB.');
  const data = await readFile(path);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return extractResumePdf(new Uint8Array(data), getDocument);
}
