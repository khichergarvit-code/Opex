import { useEffect, useRef, useState } from 'react';
import type { ApiDocument, Bbox, Classification } from '@opex/shared';
import { ApiError, fetchDocument } from '../lib/api';
import { loadPdfPage, renderPageToCanvas } from '../lib/pdf';
import { Button } from '../components/ui/Button';
import { ClassificationBanner } from '../components/ui/ClassificationBanner';

export interface ViewerTarget {
  documentId: string;
  page?: number;
  bbox?: Bbox;
}

export function DocumentViewerPage({ target, onBack }: { target: ViewerTarget; onBack: () => void }) {
  const [doc, setDoc] = useState<ApiDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(target.page ?? 1);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    fetchDocument(target.documentId)
      .then(setDoc)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load document'));
  }, [target.documentId]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { page } = await loadPdfPage(`/documents/${doc.id}/file`, pageNumber);
        if (cancelled || !canvasRef.current) return;
        await renderPageToCanvas(page, canvasRef.current);
        if (target.bbox && target.page === pageNumber) {
          const viewport = page.getViewport({ scale: 1.5 });
          const [x0, y0] = viewport.convertToViewportPoint(target.bbox.x0, target.bbox.y0);
          const [x1, y1] = viewport.convertToViewportPoint(target.bbox.x1, target.bbox.y1);
          setHighlightStyle({
            position: 'absolute',
            left: Math.min(x0, x1),
            top: Math.min(y0, y1),
            width: Math.abs(x1 - x0),
            height: Math.abs(y1 - y0),
            border: '2px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.15)',
            pointerEvents: 'none',
          });
        } else {
          setHighlightStyle(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to render page');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, target.bbox, target.page]);

  return (
    <div>
      {doc && <ClassificationBanner level={doc.classification as Classification} />}
      <div className="mx-auto max-w-4xl p-6">
        <Button variant="ghost" onClick={onBack} className="mb-3">
          ← Back
        </Button>
        {doc && <h2 className="text-lg font-semibold text-gray-900">{doc.filename}</h2>}
        {error && <p className="text-sm text-danger-600">{error}</p>}

        {doc && doc.pageCount && (
          <div className="my-3 flex items-center gap-2">
            <Button size="sm" disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>
              Prev
            </Button>
            <span className="text-sm text-gray-500">
              Page {pageNumber} / {doc.pageCount}
            </span>
            <Button size="sm" disabled={pageNumber >= doc.pageCount} onClick={() => setPageNumber((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}

        <div className="relative inline-block rounded-xl border border-gray-100 shadow-card">
          <canvas ref={canvasRef} />
          {highlightStyle && <div style={highlightStyle} />}
        </div>
      </div>
    </div>
  );
}
