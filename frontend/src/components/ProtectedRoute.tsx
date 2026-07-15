import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PERMANENT_OWNER_EMAILS = new Set(['timilehin.olowolafe@axamansard.com']);

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const location = useLocation();
  const { session, isSessionLoading, access, accessLoading, logout } = useAuth();

  if (isSessionLoading) {
    return <div className="auth-state container">Checking your session…</div>;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!requireAdmin) {
    return <>{children}</>;
  }

  if (accessLoading && !access) {
    return <div className="auth-state container">Checking administrator access…</div>;
  }

  const signedInEmail = session.user.email.trim().toLowerCase();
  const neonRoles = (session.user.role || '').split(',').map(role => role.trim().toLowerCase());
  if (PERMANENT_OWNER_EMAILS.has(signedInEmail) || neonRoles.includes('admin') || ['owner', 'admin'].includes(access?.role || '')) {
    return <>{children}</>;
  }

  return (
    <div className="auth-page container">
      <section className="auth-card glass-panel" aria-live="polite">
        <span className="auth-eyebrow">Admin Portal</span>
        <h1>Administrator access required</h1>
        <p>Your account can use the app but does not have an administrator role.</p>
        <div className="auth-actions">
          <button className="btn-secondary" type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </section>
    </div>
  );
}
