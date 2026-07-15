import { createAuthClient } from 'better-auth/react';
import { adminClient, emailOTPClient, jwtClient } from 'better-auth/client/plugins';

const authBaseUrl = (import.meta.env.VITE_NEON_AUTH_URL || '').replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [emailOTPClient(), jwtClient(), adminClient()],
  fetchOptions: {
    onSuccess(context) {
      const jwt = context.response.headers.get('set-auth-jwt');
      const data = context.data as { session?: { token?: string } } | null;
      if (jwt && data?.session) data.session.token = jwt;
    }
  }
});

export async function getAccessToken(): Promise<string> {
  if (!authBaseUrl) throw new Error('Login is not configured.');

  const sessionResult = await authClient.getSession();
  const sessionToken = sessionResult.data?.session.token;
  if (sessionToken) return sessionToken;

  const tokenResult = await authClient.token();
  if (tokenResult.error || !tokenResult.data?.token) throw new Error('Please log in.');
  return tokenResult.data.token;
}
