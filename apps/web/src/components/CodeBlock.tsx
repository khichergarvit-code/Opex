import { useState } from 'react';
import { Icon } from './ui/Icon';
import { ApiError, runSnippet, type RunSnippetResult } from '../lib/api';

const RUNNABLE_LANGS = new Set(['python', 'py']);

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
 * command output always read as a distinct surface from the surrounding prose. When a projectId is
 * given and the language is Python, Run actually executes the snippet in the real sandbox. */
export function CodeBlock({ code, lang, projectId }: { code: string; lang?: string; projectId?: string }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSnippetResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runnable = Boolean(projectId) && RUNNABLE_LANGS.has((lang || '').toLowerCase());

  async function handleRun() {
    if (!projectId || running) return;
    setRunning(true);
    setRunError(null);
    try {
      setResult(await runSnippet(projectId, code));
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'could not reach the sandbox');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-black/40 bg-[#0d0d0d] text-[#e6e6e6]" style={{ colorScheme: 'dark' }}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-white/50">{lang || 'code'}</span>
        <div className="flex items-center gap-1">
          {projectId && (
            <button
              type="button"
              onClick={handleRun}
              disabled={!runnable || running}
              title={runnable ? 'Run this in the sandbox' : 'Run only supports Python in this sandbox'}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              {running ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <Icon name="play" className="h-3 w-3" />
              )}
              {running ? 'Running…' : 'Run'}
            </button>
          )}
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
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-6">
        <code>{code}</code>
      </pre>
      {runError && <p className="border-t border-white/10 px-3 py-2 text-[12px] text-danger-400">{runError}</p>}
      {result && (
        <div className="border-t border-white/10 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-2 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-mono ${result.exitCode === 0 ? 'bg-success-600/30 text-success-600' : 'bg-danger-600/30 text-danger-600'}`}>
              exit {result.exitCode}
            </span>
            {result.timedOut && <span className="text-white/50">timed out</span>}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-white/85">
            {result.stdout}
            {result.stderr && <span className="text-danger-400">{result.stderr}</span>}
            {!result.stdout && !result.stderr && <span className="text-white/40">(no output)</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
