import { extractResumePdf } from '../shared/resume-pdf';

export async function readResumeFile(file: File) {
  if (!/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF resume.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF file no larger than 5 MB.');
  const [pdf, { default: workerUrl }] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  return extractResumePdf(new Uint8Array(await file.arrayBuffer()), pdf.getDocument);
}
