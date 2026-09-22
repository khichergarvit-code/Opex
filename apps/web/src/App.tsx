import { useState } from 'react';
import type { MeResponse, Project } from '@opex/shared';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentViewerPage, type ViewerTarget } from './pages/DocumentViewerPage';
import { TracesPage } from './pages/admin/TracesPage';
import { UsagePage } from './pages/admin/UsagePage';

type View =
  | { name: 'chat' }
  | { name: 'documents' }
  | { name: 'viewer'; target: ViewerTarget }
  | { name: 'admin-traces' }
  | { name: 'admin-usage' };

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

  if (view.name === 'admin-traces' && ADMIN_ROLES.has(user.role)) {
    return <TracesPage onBack={() => setView({ name: 'chat' })} />;
  }

  if (view.name === 'admin-usage' && ADMIN_ROLES.has(user.role)) {
    return <UsagePage onBack={() => setView({ name: 'chat' })} />;
  }

  return (
    <ChatPage
      user={user}
      onLoggedOut={() => setUser(null)}
      onActiveProjectChange={setActiveProject}
      onOpenDocuments={() => setView({ name: 'documents' })}
      onOpenCitation={(documentId, page, bbox) => setView({ name: 'viewer', target: { documentId, page, bbox } })}
      onOpenAdminTraces={ADMIN_ROLES.has(user.role) ? () => setView({ name: 'admin-traces' }) : undefined}
      onOpenAdminUsage={ADMIN_ROLES.has(user.role) ? () => setView({ name: 'admin-usage' }) : undefined}
    />
  );
}
