import { useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@opex/shared';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { fetchConversations, type ConversationSummary } from '../lib/api';
import { navigate, useRoute } from '../lib/router';
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
  onNewChat,
  onLoggedOut,
  children,
}: {
  user: MeResponse;
  activeKey: string;
  isAdmin: boolean;
  onNewChat: () => void;
  onLoggedOut: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const route = useRoute();

  // Remember the chat that was open, so "Chat" in the sidebar returns to it
  // after a trip to Usage/Documents instead of starting from a blank page.
  useEffect(() => {
    if (route.name !== 'chat') return;
    try {
      if (route.conversationId) sessionStorage.setItem('opex.lastChat', route.conversationId);
      else sessionStorage.removeItem('opex.lastChat');
    } catch {
      // sessionStorage unavailable — Chat just opens a fresh chat
    }
  }, [route]);

  // Saved chats live in Postgres; list the latest ones on every page.
  useEffect(() => {
    const load = () =>
      fetchConversations()
        .then((rows) => setRecent(rows.slice(0, 8)))
        .catch(() => {});
    load();
    window.addEventListener('opex:chats-changed', load);
    return () => window.removeEventListener('opex:chats-changed', load);
  }, []);

  function onNavigate(key: string) {
    setMenuOpen(false);
    if (key === 'chat') {
      if (route.name === 'chat') return;
      let last: string | null = null;
      try {
        last = sessionStorage.getItem('opex.lastChat');
      } catch {
        last = null;
      }
      navigate({ name: 'chat', conversationId: last ?? undefined });
    }
    else if (key === 'documents') navigate({ name: 'documents' });
    else if (key === 'my-memories') navigate({ name: 'memories' });
    else navigate({ name: 'admin', section: key });
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 md:flex-row">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-accent-500" aria-hidden="true" />
          <span className="font-semibold text-gray-900">OpeX</span>
        </div>
        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg px-2 py-1 text-lg text-gray-600 hover:bg-gray-100"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>
      <aside
        className={`${menuOpen ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-gray-100 bg-white md:flex md:w-60 max-md:absolute max-md:inset-x-0 max-md:top-[53px] max-md:bottom-0 max-md:z-30`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="h-7 w-7 rounded-full bg-accent-500" aria-hidden="true" />
          <span className="text-base font-semibold text-gray-900">OpeX</span>
        </div>

        <div className="px-3">
          <Button variant="primary" className="w-full" onClick={() => { setMenuOpen(false); onNewChat(); }}>
            + New chat
          </Button>
        </div>

        <SidebarNav>
          <SidebarSection>
            <SidebarNavItem label="Chat" active={activeKey === 'chat'} onClick={() => onNavigate('chat')} />
            <SidebarNavItem label="Documents" active={activeKey === 'documents'} onClick={() => onNavigate('documents')} />
          </SidebarSection>

          {recent.length > 0 && (
            <SidebarSection label="Recent chats">
              {recent.map((c) => (
                <SidebarNavItem
                  key={c.id}
                  label={c.title || 'Untitled chat'}
                  active={route.name === 'chat' && route.conversationId === c.id}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate({ name: 'chat', conversationId: c.id });
                  }}
                />
              ))}
            </SidebarSection>
          )}

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

      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
