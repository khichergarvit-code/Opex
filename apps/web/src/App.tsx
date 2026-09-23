import { useState } from 'react';
import type { MeResponse, Project } from '@opex/shared';
import { logout } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentViewerPage, type ViewerTarget } from './pages/DocumentViewerPage';
import { AdminLayout, type AdminSection } from './pages/admin/AdminLayout';
import { MyMemoriesPanel } from './components/MyMemoriesPanel';

type View =
  | { name: 'chat' }
  | { name: 'documents' }
  | { name: 'viewer'; target: ViewerTarget }
  | { name: 'admin'; section: AdminSection }
  | { name: 'my-memories' };

const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<View>({ name: 'chat' });

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }

  const isAdmin = ADMIN_ROLES.has(user.role);

  function handleLoggedOut() {
    logout()
      .catch(() => {})
      .finally(() => setUser(null));
  }

  if (view.name === 'documents' && activeProject) {
    return (
      <DocumentsPage
        project={activeProject}
        onOpenDocument={(documentId) => setView({ name: 'viewer', target: { documentId } })}
      />
    );
  }

  if (view.name === 'viewer') {
    return <DocumentViewerPage target={view.target} onBack={() => setView({ name: 'chat' })} />;
  }

  if (view.name === 'my-memories') {
    return <MyMemoriesPanel onBack={() => setView({ name: 'chat' })} />;
  }

  if (view.name === 'admin' && isAdmin) {
    return (
      <AdminLayout
        user={user}
        section={view.section}
        onSectionChange={(section) => setView({ name: 'admin', section })}
        onBack={() => setView({ name: 'chat' })}
        onOpenMyMemories={() => setView({ name: 'my-memories' })}
        onLoggedOut={handleLoggedOut}
      />
    );
  }

  return (
    <ChatPage
      user={user}
      isAdmin={isAdmin}
      onLoggedOut={handleLoggedOut}
      onActiveProjectChange={setActiveProject}
      onOpenDocuments={() => setView({ name: 'documents' })}
      onOpenMyMemories={() => setView({ name: 'my-memories' })}
      onOpenCitation={(documentId, page, bbox) => setView({ name: 'viewer', target: { documentId, page, bbox } })}
      onOpenAdmin={(section) => setView({ name: 'admin', section })}
    />
  );
}
