import type { SseEvent } from '@opex/shared';
import { EmptyState } from './ui/EmptyState';

const EVENT_LABELS: Partial<Record<SseEvent['type'], string>> = {
  route: 'Routed',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  citation: 'Citation',
  verify: 'Verified',
  done: 'Done',
  error: 'Error',
  memory_used: 'Memory used',
  approval_required: 'Approval required',
  plan: 'Plan',
  step_start: 'Step started',
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
    case 'memory_used':
      return `${event.data.kind}${event.data.score !== undefined ? ` (score ${event.data.score.toFixed(2)})` : ''}`;
    case 'error':
      return event.data.message;
    case 'approval_required':
      return `${event.data.toolName}: ${event.data.reason}`;
    case 'plan':
      return event.data.steps.map((s) => `${s.id}:${s.agent}`).join(' → ');
    case 'step_start':
      return `${event.data.stepId} (${event.data.agent}): ${event.data.goal}`;
    default:
      return '';
  }
}

function StepIcon({ isLast, streaming, isError }: { isLast: boolean; streaming: boolean; isError: boolean }) {
  if (isError) {
    return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-danger-600 text-[10px] text-white">!</span>;
  }
  if (isLast && streaming) {
    return <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-hidden="true" />;
  }
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-600 text-[10px] text-white" aria-hidden="true">
      ✓
    </span>
  );
}

/** Built purely from the SSE stream already flowing through lib/sse.ts — no separate backend endpoint. */
export function AgentTimeline({ events, streaming = false }: { events: SseEvent[]; streaming?: boolean }) {
  const visible = events.filter((e) => e.type !== 'token');
  if (visible.length === 0) {
    return <EmptyState title="No activity yet" description="Send a message to see agent steps here." />;
  }
  return (
    <div className="flex flex-col gap-3">
      {visible.map((event, i) => (
        <div key={i} className="flex gap-2.5">
          <StepIcon isLast={i === visible.length - 1} streaming={streaming} isError={event.type === 'error'} />
          <div className="min-w-0 flex-1 border-l-2 border-gray-100 pb-2 pl-3 -mt-0.5">
            <p className="text-xs font-semibold text-gray-700">{EVENT_LABELS[event.type] ?? event.type}</p>
            <p className="text-xs text-gray-500">{describeEvent(event)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
