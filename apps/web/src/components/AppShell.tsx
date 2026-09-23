import type { ReactNode } from 'react';
import type { MeResponse } from '@opex/shared';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { SidebarNav, SidebarNavItem, SidebarSection } from './ui/SidebarNav';

const AI_TOOLS_SECTION: Array<{ key: string; label: string }> = [
  { key: 'models', label: 'Models' },
  { key: 'agents', label: 'Agents' },
  { key: 'policies', label: 'Policies' },
];

const ADMIN_SECTION: Array<{ key: string; label: string }> = [
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'Groups' },
  { key: 'access-requests', label: 'Access requests' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'audit-log', label: 'Audit log' },
  { key: 'traces', label: 'Traces' },
  { key: 'usage', label: 'Usage' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'system', label: 'System' },
  { key: 'memory', label: 'Memory' },
  { key: 'conversations', label: 'Conversations' },
];

/**
 * The single left sidebar shell used by both ChatPage and AdminLayout —
 * only real OpeX nav items, gated by the same isAdmin decision App.tsx
 * already makes (ADMIN_ROLES.has(user.role)) and passes down; AppShell
 * never re-derives that permission decision itself.
 */
export function AppShell({
  user,
  activeKey,
  isAdmin,
  onNavigate,
  onNewChat,
  onLoggedOut,
  children,
}: {
  user: MeResponse;
  activeKey: string;
  isAdmin: boolean;
  onNavigate: (key: string) => void;
  onNewChat: () => void;
  onLoggedOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-100 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="h-7 w-7 rounded-full bg-accent-500" aria-hidden="true" />
          <span className="text-base font-semibold text-gray-900">OpeX</span>
        </div>

        <div className="px-3">
          <Button variant="primary" className="w-full" onClick={onNewChat}>
            + New chat
          </Button>
        </div>

        <SidebarNav>
          <SidebarSection>
            <SidebarNavItem label="Documents" active={activeKey === 'documents'} onClick={() => onNavigate('documents')} />
          </SidebarSection>

          {isAdmin && (
            <>
              <SidebarSection label="AI Tools">
                {AI_TOOLS_SECTION.map((item) => (
                  <SidebarNavItem key={item.key} label={item.label} active={activeKey === item.key} onClick={() => onNavigate(item.key)} />
                ))}
              </SidebarSection>
              <SidebarSection label="Administration">
                {ADMIN_SECTION.map((item) => (
                  <SidebarNavItem key={item.key} label={item.label} active={activeKey === item.key} onClick={() => onNavigate(item.key)} />
                ))}
              </SidebarSection>
            </>
          )}
        </SidebarNav>

        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Avatar email={user.email} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
              <p className="text-xs text-gray-400">{user.role}</p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <SidebarNavItem label="What OpeX remembers" active={activeKey === 'my-memories'} onClick={() => onNavigate('my-memories')} />
            <SidebarNavItem label="Sign out" onClick={onLoggedOut} />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
