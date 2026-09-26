import type { ApprovalRequiredEvent } from '@opex/shared';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { StatusPill } from './ui/Badge';

const FILE_ACTIONS: Record<string, string> = {
  write_file: 'Create or overwrite the file',
  edit_file: 'Edit the file',
  delete_file: 'Delete the file',
  move_file: 'Rename or move the file',
  create_folder: 'Create the folder',
};

/** Shows what the agent is about to do in plain words; file tools get the file name and a content preview. */
function ApprovalDetails({ toolName, args }: { toolName: string; args: unknown }) {
  const a = (args ?? {}) as Record<string, unknown>;
  if (toolName === 'run_shell') {
    return (
      <div className="text-sm text-fg">
        <p>Run this command in the isolated terminal (no network, 30 s limit):</p>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-2xl bg-fg p-3 font-mono text-xs leading-5 text-canvas">$ {String(a.command ?? '')}</pre>
      </div>
    );
  }
  if (toolName in FILE_ACTIONS) {
    const name = String(a.path ?? a.from ?? '');
    const content = typeof a.content === 'string' ? a.content : typeof a.replace === 'string' ? a.replace : null;
    return (
      <div className="text-sm text-fg">
        <p>
          {FILE_ACTIONS[toolName]} <code className="rounded bg-surface px-1.5 py-0.5 font-medium">{name}</code>
          {toolName === 'move_file' && (
            <>
              {' '}
              to <code className="rounded bg-surface px-1.5 py-0.5 font-medium">{String(a.to ?? '')}</code>
            </>
          )}
        </p>
        {content !== null && (
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-surface p-3 text-xs leading-5 text-fg-2">
            {content.length > 2000 ? `${content.slice(0, 2000)}\n… (${content.length - 2000} more characters)` : content}
          </pre>
        )}
      </div>
    );
  }
  return (
    <p className="text-sm text-fg">
      Wants to run <code className="rounded bg-surface px-1 py-0.5">{toolName}</code>: <code className="rounded bg-surface px-1 py-0.5">{JSON.stringify(args)}</code>
    </p>
  );
}

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
      <ApprovalDetails toolName={event.toolName} args={event.args} />
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
