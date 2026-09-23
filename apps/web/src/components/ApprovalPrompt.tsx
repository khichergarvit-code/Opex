import type { ApprovalRequiredEvent } from '@opex/shared';

/**
 * Inline chat card for a paused tool call (B4) — the reveal-then-submit
 * shape mirrors DocumentsPage.tsx's "Request access" card, inverted
 * (here the agent is asking, not the user).
 */
export function ApprovalPrompt({
  event,
  onApprove,
  onDeny,
  deciding,
}: {
  event: ApprovalRequiredEvent['data'];
  onApprove: () => void;
  onDeny: () => void;
  deciding: boolean;
}) {
  return (
    <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 6, padding: 10, fontSize: 13, marginTop: 8 }}>
      <div>
        Wants to run <code>{event.toolName}</code>: <code>{JSON.stringify(event.args)}</code>
      </div>
      <div style={{ color: '#92400e', marginTop: 4 }}>{event.reason}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button disabled={deciding} onClick={onApprove}>
          Approve
        </button>
        <button disabled={deciding} onClick={onDeny}>
          Deny
        </button>
      </div>
    </div>
  );
}
