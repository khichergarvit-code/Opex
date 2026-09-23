import type { Citation } from '@opex/shared';

export function CitationChip({ citation, onOpen }: { citation: Citation; onOpen: (c: Citation) => void }) {
  return (
    <button
      onClick={() => onOpen(citation)}
      title={`${citation.filename}, page ${citation.page}`}
      className="mx-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-accent-500 align-middle text-[11px] leading-none text-white hover:bg-accent-600"
    >
      {citation.marker}
    </button>
  );
}
