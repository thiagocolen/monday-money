import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Plain text of a PDF, one pdf.js text item per line, in content-stream order.
 * Line breaks carry no layout meaning (pdf.js may merge or split visual rows),
 * so parsers should match on the token stream rather than on lines.
 */
export async function extractPdfText(data: Buffer): Promise<string> {
  const loadingTask = getDocument({ data: new Uint8Array(data), useSystemFonts: false });
  try {
    const doc = await loadingTask.promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { items } = await page.getTextContent();
      for (const item of items) {
        if ('str' in item && item.str.trim()) lines.push(item.str.trim());
      }
    }
    return lines.join('\n');
  } finally {
    await loadingTask.destroy();
  }
}
