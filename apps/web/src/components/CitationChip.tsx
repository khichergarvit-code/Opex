import type { Citation } from '@opex/shared';

export function CitationChip({ citation, onOpen }: { citation: Citation; onOpen: (c: Citation) => void }) {
  return (
    <button
      onClick={() => onOpen(citation)}
      title={`${citation.filename}, page ${citation.page}`}
      className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 align-middle text-[11px] font-medium leading-none text-on-accent transition-transform hover:scale-110 hover:bg-accent-600 active:scale-95"
    >
      {citation.marker}
    </button>
  );
}
