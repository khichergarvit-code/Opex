import * as pdfjsLib from 'pdfjs-dist';

// Bundled by Vite (no CDN) — see vite.config.ts's comment and public/pdfjs/.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONT_DATA_URL = '/pdfjs/standard_fonts/';

export async function loadPdfPage(
  url: string,
  pageNumber: number,
): Promise<{ page: pdfjsLib.PDFPageProxy; doc: pdfjsLib.PDFDocumentProxy }> {
  const doc = await pdfjsLib.getDocument({
    url,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const page = await doc.getPage(pageNumber);
  return { page, doc };
}

export async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale = 1.5,
): Promise<{ width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return { width: viewport.width, height: viewport.height };
}
