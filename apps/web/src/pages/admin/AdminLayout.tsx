import type { MeResponse } from '@opex/shared';
import { AppShell } from '../../components/AppShell';
import { TracesPage } from './TracesPage';
import { UsagePage } from './UsagePage';
import { UsersPage } from './UsersPage';
import { GroupsPage } from './GroupsPage';
import { AccessRequestsPage } from './AccessRequestsPage';
import { ApprovalsPage } from './ApprovalsPage';
import { ConversationViewerPage } from './ConversationViewerPage';
import { AuditLogPage } from './AuditLogPage';
import { ModelsPage } from './ModelsPage';
import { PoliciesPage } from './PoliciesPage';
import { AgentsPage } from './AgentsPage';
import { MemoryPage } from './MemoryPage';
import { FeedbackPage } from './FeedbackPage';
import { FilesPage } from './FilesPage';
import { SystemPage } from './SystemPage';

export type AdminSection =
  | 'traces'
  | 'usage'
  | 'users'
  | 'groups'
  | 'access-requests'
  | 'approvals'
  | 'files'
  | 'conversations'
  | 'audit-log'
  | 'models'
  | 'policies'
  | 'agents'
  | 'memory'
  | 'feedback'
  | 'system';

export function AdminLayout({
  user,
  section,
  onBack,
  onLoggedOut,
}: {
  user: MeResponse;
  section: AdminSection;
  onBack: () => void;
  onLoggedOut: () => void;
}) {
  return (
    <AppShell
      user={user}
      activeKey={section}
      isAdmin
      onNewChat={onBack}
      onLoggedOut={onLoggedOut}
    >
      <div className="p-6">
        {section === 'traces' && <TracesPage onBack={onBack} />}
        {section === 'usage' && <UsagePage onBack={onBack} />}
        {section === 'users' && <UsersPage onBack={onBack} isSuperAdmin={user.role === 'super_admin'} />}
        {section === 'groups' && <GroupsPage onBack={onBack} />}
        {section === 'access-requests' && <AccessRequestsPage onBack={onBack} />}
        {section === 'approvals' && <ApprovalsPage onBack={onBack} />}
        {section === 'files' && <FilesPage onBack={onBack} />}
        {section === 'conversations' && <ConversationViewerPage onBack={onBack} />}
        {section === 'audit-log' && <AuditLogPage onBack={onBack} />}
        {section === 'models' && <ModelsPage onBack={onBack} />}
        {section === 'policies' && <PoliciesPage onBack={onBack} />}
        {section === 'agents' && <AgentsPage onBack={onBack} />}
        {section === 'memory' && <MemoryPage onBack={onBack} />}
        {section === 'feedback' && <FeedbackPage onBack={onBack} />}
        {section === 'system' && <SystemPage onBack={onBack} />}
      </div>
    </AppShell>
  );
}
