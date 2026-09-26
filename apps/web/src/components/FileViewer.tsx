import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useDismiss } from '../lib/useDismiss';
import { useRef } from 'react';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Splits CSV/TSV text into rows for a simple table (no quoting cleverness: for a quick look, not editing). */
function parseDelimited(text: string, delimiter: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .slice(0, 200)
    .map((line) => line.split(delimiter).map((c) => c.replace(/^"|"$/g, '')));
}

/**
 * Opens a file in place: text/markdown/JSON/log with line numbers, CSV as a table, images inline.
 * `src` is the inline URL, `downloadUrl` the same file as an attachment.
 */
export function FileViewer({ name, src, downloadUrl, onClose }: { name: string; src: string; downloadUrl: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const isImage = IMAGE_EXT.test(name);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isImage) return;
    setText(null);
    setError(null);
    fetch(src, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 413 ? 'This file is too large to open here. Download it instead.' : `Could not open the file (${r.status}).`);
        setText(await r.text());
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the file.'));
  }, [src, isImage]);

  const isCsv = /\.(csv|tsv)$/i.test(name);
  const rows = text && isCsv ? parseDelimited(text, /\.tsv$/i.test(name) ? '\t' : ',') : null;
  let display = text ?? '';
  if (text && /\.json$/i.test(name)) {
    try {
      display = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      display = text;
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-fg/40 p-4" role="dialog" aria-modal="true" aria-label={`Open ${name}`}>
      <div ref={ref} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-surface shadow-lift">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <Icon name="file" className="h-5 w-5 text-accent-600" />
          <p className="min-w-0 flex-1 truncate font-medium text-fg">{name}</p>
          {text !== null && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="rounded-full px-3 py-1.5 text-sm text-fg-2 hover:bg-raised"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          <a href={downloadUrl} download={name} className="rounded-full bg-accent-100 px-4 py-1.5 text-sm font-medium text-accent-700 hover:bg-accent-200">
            Download
          </a>
          <Button variant="ghost" onClick={onClose} aria-label="Close" className="!px-2">
            <Icon name="close" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {isImage ? (
            <img src={src} alt={name} className="mx-auto max-h-[70vh] rounded-2xl" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-danger-700">{error}</p>
          ) : text === null ? (
            <p className="py-8 text-center text-sm text-muted">Opening…</p>
          ) : rows ? (
            <table className="w-full text-left text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i === 0 ? 'border-b border-line font-medium text-fg' : 'border-b border-line/50 text-fg-2'}>
                    {r.map((c, j) => (
                      <td key={j} className="px-3 py-1.5">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-fg">
              {display.split('\n').map((line, i) => (
                <div key={i} className="flex gap-4">
                  <span className="w-8 shrink-0 select-none text-right text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1">{line || ' '}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
