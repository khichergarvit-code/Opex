import { useState } from 'react';
import { Icon } from './ui/Icon';

export interface ContentSegment {
  kind: 'text' | 'code';
  text: string;
  /** Code segments only: the fence's language tag, e.g. "python" (empty string if none given). */
  lang?: string;
}

/**
 * Splits message content on ``` fences into alternating text/code segments, so prose can keep going
 * through the normal citation-marker renderer while code gets its own dark, monospaced panel. An
 * unclosed trailing fence is still treated as code (a code block streaming in token by token has no
 * closing fence yet) rather than left as literal backticks.
 */
export function splitContentSegments(content: string): ContentSegment[] {
  const parts = content.split(/```/);
  if (parts.length === 1) return content ? [{ kind: 'text', text: content }] : [];
  const segments: ContentSegment[] = [];
  for (const [i, part] of parts.entries()) {
    if (i % 2 === 0) {
      if (part) segments.push({ kind: 'text', text: part });
      continue;
    }
    const newline = part.indexOf('\n');
    const firstLine = newline === -1 ? part : part.slice(0, newline);
    const isLangTag = /^[\w+#.-]{0,20}$/.test(firstLine.trim());
    const lang = isLangTag ? firstLine.trim() : '';
    const code = isLangTag && newline !== -1 ? part.slice(newline + 1) : part;
    segments.push({ kind: 'code', text: code.replace(/\n$/, ''), lang });
  }
  return segments;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard unavailable — Copy just silently does nothing
  }
}

/** A dark, monospaced "terminal" panel — fixed colours regardless of light/dark theme, so code and
 * command output always read as a distinct surface from the surrounding prose. */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-black/40 bg-[#0d0d0d] text-[#e6e6e6]" style={{ colorScheme: 'dark' }}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-white/50">{lang || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void copyText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-3 w-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}
