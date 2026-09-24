import type { ApprovalRequiredEvent } from '@opex/shared';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { StatusPill } from './ui/Badge';

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
    <Card className="border-warning-600/20 bg-warning-50">
      <div className="mb-2">
        <StatusPill tone="warning">Approval needed</StatusPill>
      </div>
      <p className="text-sm text-fg">
        Wants to run <code className="rounded bg-surface px-1 py-0.5">{event.toolName}</code>:{' '}
        <code className="rounded bg-surface px-1 py-0.5">{JSON.stringify(event.args)}</code>
      </p>
      <p className="mt-1 text-sm text-warning-700">{event.reason}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={deciding} onClick={onApprove}>
          Approve
        </Button>
        <Button variant="danger" disabled={deciding} onClick={onDeny}>
          Deny
        </Button>
      </div>
    </Card>
  );
}
