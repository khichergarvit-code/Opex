import { useState } from 'react';
import type { MeResponse, Project } from '@opex/shared';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentViewerPage, type ViewerTarget } from './pages/DocumentViewerPage';
import { AdminLayout, type AdminSection } from './pages/admin/AdminLayout';

type View =
  | { name: 'chat' }
  | { name: 'documents' }
  | { name: 'viewer'; target: ViewerTarget }
  | { name: 'admin'; section: AdminSection };

const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [view, setView] = useState<View>({ name: 'chat' });

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
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

  if (view.name === 'admin' && ADMIN_ROLES.has(user.role)) {
    return (
      <AdminLayout
        section={view.section}
        onSectionChange={(section) => setView({ name: 'admin', section })}
        onBack={() => setView({ name: 'chat' })}
      />
    );
  }

  return (
    <ChatPage
      user={user}
      onLoggedOut={() => setUser(null)}
      onActiveProjectChange={setActiveProject}
      onOpenDocuments={() => setView({ name: 'documents' })}
      onOpenCitation={(documentId, page, bbox) => setView({ name: 'viewer', target: { documentId, page, bbox } })}
      onOpenAdmin={ADMIN_ROLES.has(user.role) ? (section) => setView({ name: 'admin', section }) : undefined}
    />
  );
}
