import type { getDocument as PdfLoader } from 'pdfjs-dist/types/src/pdf.js';

/** Shared extraction limits for the CLI and browser; never saves or sends text. */
export async function extractResumePdf(data: Uint8Array, getDocument: typeof PdfLoader): Promise<{ text: string; pages: number }> {
  if (data.byteLength > 5 * 1024 * 1024) throw new Error('Choose a PDF file no larger than 5 MB.');
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) throw new Error('This file does not contain a valid PDF header.');
  const loading = getDocument({ data: new Uint8Array(data), useSystemFonts: false, verbosity: 0 });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void loading.destroy(); }, 20_000);
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 15) throw new Error('Choose a resume with at most 15 pages.');
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
      pages.push(text); page.cleanup();
    }
    const text = pages.filter(Boolean).join('\n\n').trim();
    if (!text) throw new Error('This PDF has no readable text. It may be scanned; export a searchable PDF or run OCR first.');
    if (text.length > 16000) throw new Error('This PDF contains more than 16,000 characters. Use a shorter resume so nothing is silently omitted.');
    return { text, pages: pdf.numPages };
  } catch (error) {
    if (timedOut) throw new Error('PDF reading timed out. Try a smaller searchable PDF.');
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is password-protected. Export an unlocked copy before importing.');
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('This PDF is damaged or invalid. Export a new copy.');
    throw error;
  } finally { clearTimeout(timer); await loading.destroy(); }
}
