import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { MeResponse } from '@opex/shared';
import { Avatar } from './ui/Avatar';
import { Logo } from './ui/Logo';
import { Icon, type IconName } from './ui/Icon';
import { ripple } from '../lib/ripple';
import { fetchConversations, type ConversationSummary } from '../lib/api';
import { navigate, useRoute } from '../lib/router';
import { SidebarNav, SidebarNavItem, SidebarSection } from './ui/SidebarNav';

const AI_TOOLS_SECTION: Array<{ key: string; label: string; icon: IconName }> = [
  { key: 'models', label: 'Models', icon: 'layers' },
  { key: 'agents', label: 'Agents', icon: 'bot' },
  { key: 'policies', label: 'Policies', icon: 'shield' },
];

const ADMIN_SECTION: Array<{ key: string; label: string; icon: IconName }> = [
  { key: 'users', label: 'Users', icon: 'users' },
  { key: 'groups', label: 'Groups', icon: 'users' },
  { key: 'access-requests', label: 'Access requests', icon: 'inbox' },
  { key: 'approvals', label: 'Approvals', icon: 'check' },
  { key: 'files', label: 'Files', icon: 'file' },
  { key: 'audit-log', label: 'Audit log', icon: 'list' },
  { key: 'traces', label: 'Traces', icon: 'pulse' },
  { key: 'usage', label: 'Usage', icon: 'coins' },
  { key: 'feedback', label: 'Feedback', icon: 'thumbs' },
  { key: 'system', label: 'System', icon: 'server' },
  { key: 'memory', label: 'Memory', icon: 'memory' },
  { key: 'conversations', label: 'Conversations', icon: 'chat' },
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
    else if (key === 'workspace') navigate({ name: 'workspace' });
    else if (key === 'my-memories') navigate({ name: 'memories' });
    else navigate({ name: 'admin', section: key });
  }

  const item = (key: string, label: string, icon: IconName) => (
    <SidebarNavItem key={key} label={label} icon={<Icon name={icon} />} active={activeKey === key} onClick={() => onNavigate(key)} />
  );

  const navContent = (
    <>
      <div className="flex items-center gap-2 px-5 pb-3 pt-5">
        <Logo />
        {isAdmin && (
          // GitHub-style breadcrumb: the product mark, a slash, then the area you are in.
          <span className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="text-lg font-light text-faint">/</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-fg-2">{activeKey === 'chat' || activeKey === 'documents' || activeKey === 'my-memories' ? 'workspace' : 'admin'}</span>
          </span>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onPointerDown={ripple}
          onClick={() => {
            setMenuOpen(false);
            onNewChat();
          }}
          className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-accent-100 px-5 py-3.5 text-sm font-medium text-accent-700 shadow-card transition-[box-shadow,transform,background-color] duration-200 hover:bg-accent-200 hover:shadow-lift active:scale-[0.98]"
        >
          <Icon name="plus" />
          New chat
        </button>
      </div>

      <SidebarNav>
        <SidebarSection>
          {item('chat', 'Chat', 'chat')}
          {item('documents', 'Documents', 'file')}
          {item('workspace', 'My files', 'layers')}
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
            {/* Models, agents and system settings are platform-wide: only a super admin sees them. */}
            <SidebarSection label="AI tools">{AI_TOOLS_SECTION.filter((i) => user.role === 'super_admin' || i.key === 'policies').map((i) => item(i.key, i.label, i.icon))}</SidebarSection>
            <SidebarSection label="Administration">{ADMIN_SECTION.slice(0, 5).map((i) => item(i.key, i.label, i.icon))}</SidebarSection>
            <SidebarSection label="Monitoring">{ADMIN_SECTION.slice(5, 9).map((i) => item(i.key, i.label, i.icon))}</SidebarSection>
            {/* The last three get a darker panel so they read as a separate, more technical group. */}
            <div className="mb-3 rounded-3xl bg-raised/80 p-1.5">
              <SidebarSection label="Data and system">{ADMIN_SECTION.slice(9).filter((i) => user.role === 'super_admin' || i.key !== 'system').map((i) => item(i.key, i.label, i.icon))}</SidebarSection>
            </div>
          </>
        )}
      </SidebarNav>

      <div className="mx-3 mb-3 rounded-3xl bg-surface p-3">
        <div className="mb-2 flex items-center gap-3 px-1">
          <Avatar email={user.email} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{user.email}</p>
            <p className="text-xs text-muted">{user.role}</p>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem label="What OpeX remembers" icon={<Icon name="memory" />} active={activeKey === 'my-memories'} onClick={() => onNavigate('my-memories')} />
          <SidebarNavItem label="Sign out" icon={<Icon name="logout" />} onClick={onLoggedOut} />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-side md:flex-row">
      <header className="flex items-center justify-between bg-side px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <Logo markClassName="h-8 w-8" textClassName="text-lg" />
        </div>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>
      </header>

      <aside className="hidden w-64 shrink-0 flex-col md:flex">{navContent}</aside>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-30 bg-fg/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col rounded-r-[28px] bg-side shadow-lift md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMenuOpen(false)}
                className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full text-fg-2 hover:bg-raised"
              >
                <Icon name="close" />
              </button>
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="min-h-0 flex-1 overflow-y-auto bg-canvas md:m-2 md:ml-0 md:rounded-[28px] md:border md:border-line/40 md:shadow-card">
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
