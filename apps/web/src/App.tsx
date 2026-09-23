import { useEffect, useState, type ReactNode } from 'react';
import type { MeResponse, Project } from '@opex/shared';
import { fetchMe, fetchProjects, logout } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentViewerPage } from './pages/DocumentViewerPage';
import { AdminLayout, type AdminSection } from './pages/admin/AdminLayout';
import { MyMemoriesPanel } from './components/MyMemoriesPanel';

const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const route = useRoute();

  useEffect(() => {
    // The session cookie survives a browser refresh even though this
    // component's state doesn't — without this, every reload would bounce
    // an already-logged-in user back to the login screen.
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  // Deep links (e.g. #/documents) never mount ChatPage, which is what
  // normally sets the active project — so resolve a default here.
  useEffect(() => {
    if (!user) return;
    fetchProjects()
      .then((rows) => setActiveProject((current) => current ?? rows[0] ?? null))
      .catch(() => {});
  }, [user]);

  // Signed-in users have no reason to see the landing/login pages.
  useEffect(() => {
    if (user && (route.name === 'landing' || route.name === 'login')) navigate({ name: 'chat' }, { replace: true });
  }, [user, route.name]);

  if (checkingSession) {
    return <div className="flex h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">Loading…</div>;
  }

  if (!user) {
    if (route.name === 'login') {
      return (
        <LoginPage
          onLoggedIn={(u) => {
            setUser(u);
            navigate({ name: 'chat' }, { replace: true });
          }}
        />
      );
    }
    return <LandingPage />;
  }

  const isAdmin = ADMIN_ROLES.has(user.role);

  function handleLoggedOut() {
    logout()
      .catch(() => {})
      .finally(() => {
        setUser(null);
        setActiveProject(null);
        navigate({ name: 'landing' }, { replace: true });
      });
  }

  const shell = (activeKey: string, children: ReactNode) => (
    <AppShell
      user={user}
      activeKey={activeKey}
      isAdmin={isAdmin}
      onNewChat={() => navigate({ name: 'chat' })}
      onLoggedOut={handleLoggedOut}
    >
      {children}
    </AppShell>
  );

  if (route.name === 'documents') {
    return shell(
      'documents',
      activeProject ? (
        <DocumentsPage
          project={activeProject}
          onOpenDocument={(documentId) => navigate({ name: 'viewer', documentId })}
        />
      ) : (
        <p className="p-6 text-sm text-gray-400">Loading…</p>
      ),
    );
  }

  if (route.name === 'viewer') {
    return shell(
      'documents',
      <DocumentViewerPage
        key={`${route.documentId}-${route.page ?? ''}`}
        target={{ documentId: route.documentId, page: route.page, bbox: route.bbox }}
        onBack={() => (window.history.length > 1 ? window.history.back() : navigate({ name: 'documents' }))}
      />,
    );
  }

  if (route.name === 'memories') {
    return shell('my-memories', <MyMemoriesPanel onBack={() => navigate({ name: 'chat' })} />);
  }

  if (route.name === 'admin' && isAdmin) {
    return <AdminLayout user={user} section={route.section as AdminSection} onBack={() => navigate({ name: 'chat' })} onLoggedOut={handleLoggedOut} />;
  }

  return (
    <ChatPage
      user={user}
      conversationId={route.name === 'chat' ? route.conversationId : undefined}
      isAdmin={isAdmin}
      onLoggedOut={handleLoggedOut}
      onActiveProjectChange={setActiveProject}
      onOpenDocuments={() => navigate({ name: 'documents' })}
      onOpenCitation={(documentId, page, bbox) => navigate({ name: 'viewer', documentId, page, bbox })}
    />
  );
}
