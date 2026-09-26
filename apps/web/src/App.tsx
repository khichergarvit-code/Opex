import { useEffect, useState, type ReactNode } from 'react';
import { pickProject, storeProjectId } from './lib/activeProject';
import type { MeResponse, Project } from '@opex/shared';
import { fetchMe, fetchProjects, logout } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { DocumentViewerPage } from './pages/DocumentViewerPage';
import { AdminLayout, type AdminSection } from './pages/admin/AdminLayout';
import { MyMemoriesPanel } from './components/MyMemoriesPanel';
import { Skeleton } from './components/ui/Skeleton';

const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
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
      .then((rows) => {
        setAllProjects(rows);
        setActiveProject((current) => current ?? pickProject(rows) ?? null);
      })
      .catch(() => {});
  }, [user]);

  // Signed-in users have no reason to see the landing/login pages.
  useEffect(() => {
    if (user && (route.name === 'landing' || route.name === 'login')) navigate({ name: 'chat' }, { replace: true });
  }, [user, route.name]);

  if (checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas" role="status" aria-label="Loading">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-accent-100 border-t-accent-500" />
      </div>
    );
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
          projects={allProjects}
          onProjectChange={(id) => {
            storeProjectId(id);
            setActiveProject(allProjects.find((p) => p.id === id) ?? activeProject);
          }}
          onOpenDocument={(documentId) => navigate({ name: 'viewer', documentId })}
        />
      ) : (
        <Skeleton className="p-6" />
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

  if (route.name === 'workspace') {
    return shell(
      'workspace',
      activeProject ? (
        <WorkspacePage
          project={activeProject}
          projects={allProjects}
          isAdmin={ADMIN_ROLES.has(user.role)}
          onProjectChange={(id) => {
            storeProjectId(id);
            setActiveProject(allProjects.find((p) => p.id === id) ?? activeProject);
          }}
        />
      ) : (
        <Skeleton className="p-6" />
      ),
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
