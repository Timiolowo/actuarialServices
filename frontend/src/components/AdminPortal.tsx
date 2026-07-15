import React, { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { useAuth } from '../context/AuthContext';

type AdminTab = 'team' | 'activity';
type AccessStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
type AccessRole = 'member' | 'admin' | 'owner';

interface AccessUser {
  auth_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: AccessStatus;
  role: AccessRole;
  requested_at: string;
  reviewed_at: string | null;
}

interface AuditEntry {
  id: number;
  actor_email: string;
  target_email: string;
  action: string;
  created_at: string;
}

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'team', label: 'Team access' },
  { id: 'activity', label: 'Admin activity' }
];

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'The request could not be completed.');
  return body as T;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export const AdminPortal: React.FC = () => {
  const { access } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('team');
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResponse, auditResponse] = await Promise.all([
        authFetch('/api/admin/access-users'),
        authFetch('/api/admin/access-audit')
      ]);
      setUsers(await readResponse<AccessUser[]>(usersResponse));
      setAudit(await readResponse<AuditEntry[]>(auditResponse));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The admin data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateUser = async (user: AccessUser, status: Exclude<AccessStatus, 'pending'>, role = user.role) => {
    setUpdatingId(user.auth_user_id);
    setError(null);
    try {
      const response = await authFetch(`/api/admin/access-users/${encodeURIComponent(user.auth_user_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, role })
      });
      await readResponse<AccessUser>(response);
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Access could not be updated.');
    } finally {
      setUpdatingId(null);
    }
  };

  const authorisedCount = users.filter(user => user.status === 'approved').length;
  const ownerCount = users.filter(user => user.status === 'approved' && user.role === 'owner').length;
  const revokedCount = users.filter(user => user.status === 'revoked').length;
  const tabCounts: Record<AdminTab, number> = { team: users.length, activity: audit.length };

  return (
    <div className="admin-page container">
      <div className="admin-hero">
        <div>
          <span className="admin-eyebrow">Administration</span>
          <h1>Admin Portal</h1>
          <p>Manage team roles, revoke access, and audit administrative decisions.</p>
        </div>
        <button className="btn-secondary" type="button" onClick={() => void loadData()} disabled={loading}>Refresh</button>
      </div>

      {error && <div className="admin-notice" role="alert"><strong>{error}</strong></div>}

      <section className="admin-summary" aria-label="Access summary">
        <article className="admin-stat glass-panel"><span>Total users</span><strong>{users.length}</strong><small>Verified company accounts</small></article>
        <article className="admin-stat glass-panel"><span>Authorised users</span><strong>{authorisedCount}</strong><small>Can access the workspace</small></article>
        <article className="admin-stat glass-panel"><span>Owners</span><strong>{ownerCount}</strong><small>{revokedCount} revoked user{revokedCount === 1 ? '' : 's'}</small></article>
      </section>

      <section className="admin-workspace glass-panel">
        <div className="admin-tabs" role="tablist" aria-label="Admin portal sections">
          {tabs.map(tab => (
            <button type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.label}<span>{tabCounts[tab.id]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="admin-empty">Loading access records…</div>
        ) : activeTab === 'activity' ? (
          audit.length ? (
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>User</th></tr></thead><tbody>
              {audit.map(entry => <tr key={entry.id}><td>{formatDate(entry.created_at)}</td><td>{entry.actor_email}</td><td><span className="admin-status">{entry.action}</span></td><td>{entry.target_email}</td></tr>)}
            </tbody></table></div>
          ) : <div className="admin-empty"><h2>No admin activity yet</h2><p>Access decisions will be recorded here.</p></div>
        ) : users.length ? (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Joined</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead><tbody>
            {users.map(user => (
              <tr key={user.auth_user_id}>
                <td><strong>{[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Name unavailable'}</strong><br /><small>{user.email}</small></td><td>{formatDate(user.requested_at)}</td><td><span className={`admin-status ${user.status}`}>{user.status}</span></td>
                <td>
                  {user.status === 'approved' ? <select value={user.role} disabled={updatingId === user.auth_user_id || (user.role === 'owner' && access?.role !== 'owner')} onChange={event => void updateUser(user, 'approved', event.target.value as AccessRole)}><option value="member">Member</option><option value="admin">Admin</option>{access?.role === 'owner' && <option value="owner">Owner</option>}</select> : user.role}
                </td>
                <td><div className="admin-actions">
                  {user.status === 'pending' && <><button className="btn-primary" type="button" disabled={updatingId === user.auth_user_id} onClick={() => void updateUser(user, 'approved')}>Approve</button><button className="btn-secondary" type="button" disabled={updatingId === user.auth_user_id} onClick={() => void updateUser(user, 'rejected')}>Reject</button></>}
                  {user.status === 'approved' && <button className="btn-secondary danger" type="button" disabled={updatingId === user.auth_user_id} onClick={() => void updateUser(user, 'revoked')}>Revoke</button>}
                  {['rejected', 'revoked'].includes(user.status) && <button className="btn-primary" type="button" disabled={updatingId === user.auth_user_id} onClick={() => void updateUser(user, 'approved')}>Restore</button>}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="admin-empty"><h2>No team records</h2><p>Verified company users will appear after their first sign-in.</p></div>}
      </section>
    </div>
  );
};
