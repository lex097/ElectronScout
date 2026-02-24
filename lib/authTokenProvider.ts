/**
 * Provides the current access token for Supabase client.
 * Auth store updates this when user signs in/out or refreshes.
 */
let getTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!getTokenFn) return null;
  return getTokenFn();
}
