import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const location = useLocation();
  const { session, isSessionLoading, access, accessLoading, accessError, logout } = useAuth();

  if (isSessionLoading || (session && accessLoading && !access)) {
    return <div className="auth-state container">Checking your access…</div>;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (access?.status === 'approved' && (!requireAdmin || ['owner', 'admin'].includes(access.role))) {
    return <>{children}</>;
  }

  return (
    <div className="auth-page container">
      <section className="auth-card glass-panel" aria-live="polite">
        <span className="auth-eyebrow">Secure workspace</span>
        <h1>You are not authorised</h1>
        <p>
          {requireAdmin && access?.status === 'approved'
            ? 'Your account does not have administrator access.'
            : 'Your account cannot access this workspace. Contact an application owner if access was revoked.'}
        </p>
        {accessError && <div className="auth-error" role="alert">{accessError}</div>}
        <div className="auth-actions">
          <button className="btn-secondary" type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </section>
    </div>
  );
}
