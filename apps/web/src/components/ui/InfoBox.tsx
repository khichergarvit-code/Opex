import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** A calm explainer block for pages whose concepts are not obvious (what is a policy, what is an agent). */
export function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 flex gap-3 rounded-3xl bg-accent-50 p-4 text-sm text-fg-2">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700" aria-hidden="true">
        <Icon name="memory" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-fg">{title}</p>
        <div className="mt-1 flex flex-col gap-2 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
