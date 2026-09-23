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
import { SystemPage } from './SystemPage';

export type AdminSection =
  | 'traces'
  | 'usage'
  | 'users'
  | 'groups'
  | 'access-requests'
  | 'approvals'
  | 'conversations'
  | 'audit-log'
  | 'models'
  | 'policies'
  | 'agents'
  | 'memory'
  | 'feedback'
  | 'system';

const SECTIONS: Array<{ key: AdminSection; label: string }> = [
  { key: 'traces', label: 'Traces' },
  { key: 'usage', label: 'Usage' },
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'Groups' },
  { key: 'access-requests', label: 'Access requests' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'audit-log', label: 'Audit log' },
  { key: 'models', label: 'Models' },
  { key: 'policies', label: 'Policies' },
  { key: 'agents', label: 'Agents' },
  { key: 'memory', label: 'Memory' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'system', label: 'System' },
];

export function AdminLayout({
  section,
  onSectionChange,
  onBack,
}: {
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: 'flex', fontFamily: 'sans-serif' }}>
      <div style={{ width: 160, borderRight: '1px solid #e5e7eb', padding: 12, minHeight: '100vh' }}>
        <button onClick={onBack} style={{ marginBottom: 12, width: '100%' }}>
          ← Chat
        </button>
        {SECTIONS.map((s) => (
          <div
            key={s.key}
            onClick={() => onSectionChange(s.key)}
            style={{
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: 4,
              background: section === s.key ? '#dbeafe' : undefined,
              fontSize: 13,
            }}
          >
            {s.label}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        {section === 'traces' && <TracesPage onBack={onBack} />}
        {section === 'usage' && <UsagePage onBack={onBack} />}
        {section === 'users' && <UsersPage onBack={onBack} />}
        {section === 'groups' && <GroupsPage onBack={onBack} />}
        {section === 'access-requests' && <AccessRequestsPage onBack={onBack} />}
        {section === 'approvals' && <ApprovalsPage onBack={onBack} />}
        {section === 'conversations' && <ConversationViewerPage onBack={onBack} />}
        {section === 'audit-log' && <AuditLogPage onBack={onBack} />}
        {section === 'models' && <ModelsPage onBack={onBack} />}
        {section === 'policies' && <PoliciesPage onBack={onBack} />}
        {section === 'agents' && <AgentsPage onBack={onBack} />}
        {section === 'memory' && <MemoryPage onBack={onBack} />}
        {section === 'feedback' && <FeedbackPage onBack={onBack} />}
        {section === 'system' && <SystemPage onBack={onBack} />}
      </div>
    </div>
  );
}
