import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authClient } from '../lib/authClient';
import { authFetch } from '../lib/authFetch';

export type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';
export type AccessRole = 'member' | 'admin' | 'owner';

export interface AppAccess {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: AccessStatus;
  role: AccessRole;
}

interface AuthContextValue {
  session: ReturnType<typeof authClient.useSession>['data'];
  isSessionLoading: boolean;
  access: AppAccess | null;
  accessLoading: boolean;
  accessError: string | null;
  refreshAccess: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'The request could not be completed.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sessionResult = authClient.useSession();
  const [access, setAccess] = useState<AppAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const refreshAccess = useCallback(async () => {
    if (!sessionResult.data) {
      setAccess(null);
      setAccessError(null);
      return;
    }

    setAccessLoading(true);
    setAccessError(null);
    try {
      const response = await authFetch('/api/auth/me');
      if (!response.ok) throw new Error(await readError(response));
      setAccess(await response.json() as AppAccess);
    } catch (error) {
      setAccess(null);
      setAccessError(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      setAccessLoading(false);
    }
  }, [sessionResult.data]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  const logout = useCallback(async () => {
    await authClient.signOut();
    setAccess(null);
    setAccessError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session: sessionResult.data,
    isSessionLoading: sessionResult.isPending,
    access,
    accessLoading,
    accessError,
    refreshAccess,
    logout
  }), [access, accessError, accessLoading, logout, refreshAccess, sessionResult.data, sessionResult.isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
