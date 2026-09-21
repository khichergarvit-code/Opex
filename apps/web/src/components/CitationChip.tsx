import type { Citation } from '@opex/shared';

export function CitationChip({ citation, onOpen }: { citation: Citation; onOpen: (c: Citation) => void }) {
  return (
    <button
      onClick={() => onOpen(citation)}
      title={`${citation.filename}, page ${citation.page}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2563eb',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        width: 18,
        height: 18,
        fontSize: 11,
        lineHeight: 1,
        cursor: 'pointer',
        margin: '0 2px',
        verticalAlign: 'middle',
      }}
    >
      {citation.marker}
    </button>
  );
}
