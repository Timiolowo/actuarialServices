import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, jwtClient } from 'better-auth/client/plugins';

const authBaseUrl = (import.meta.env.VITE_NEON_AUTH_URL || '').replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [emailOTPClient(), jwtClient()]
});

export async function getAccessToken(): Promise<string> {
  if (!authBaseUrl) throw new Error('Login is not configured.');

  const result = await authClient.token();
  if (result.error || !result.data?.token) {
    throw new Error('Please log in.');
  }
  return result.data.token;
}
