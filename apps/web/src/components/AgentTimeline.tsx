import type { SseEvent } from '@opex/shared';

const EVENT_LABELS: Partial<Record<SseEvent['type'], string>> = {
  route: 'Routed',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  citation: 'Citation',
  verify: 'Verified',
  done: 'Done',
  error: 'Error',
};

function describeEvent(event: SseEvent): string {
  switch (event.type) {
    case 'route':
      return `${event.data.taskType} → ${event.data.agent} agent (${event.data.reason})`;
    case 'tool_call':
      return `${event.data.toolName}(${JSON.stringify(event.data.args)})`;
    case 'tool_result':
      return `${event.data.status}: ${event.data.summary}`;
    case 'citation':
      return `[${event.data.marker}] ${event.data.filename}, p.${event.data.page}`;
    case 'verify':
      return event.data.ok ? 'all citations verified' : `${event.data.uncitedClaims} uncited claim(s)`;
    case 'status':
      return `${event.data.state}: ${event.data.model}`;
    case 'error':
      return event.data.message;
    default:
      return '';
  }
}

/** Built purely from the SSE stream already flowing through lib/sse.ts — no separate backend endpoint. */
export function AgentTimeline({ events }: { events: SseEvent[] }) {
  const visible = events.filter((e) => e.type !== 'token');
  if (visible.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 12 }}>No timeline events yet — send a message.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      {visible.map((event, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, borderLeft: '2px solid #e5e7eb', paddingLeft: 8 }}>
          <strong style={{ minWidth: 90 }}>{EVENT_LABELS[event.type] ?? event.type}</strong>
          <span style={{ color: '#374151' }}>{describeEvent(event)}</span>
        </div>
      ))}
    </div>
  );
}
