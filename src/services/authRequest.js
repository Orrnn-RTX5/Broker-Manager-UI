import authService from './authService.js';
import { isAuthExpiredResponse, isAuthExpiredStatus } from './authHttpStatus.js';

export const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';
export const SESSION_RENEWAL_FAILED_MESSAGE = 'Could not renew the session. Check the connection and try again.';

// A refresh that failed for a transient reason (network, 5xx) keeps the user
// signed in; only a session that is actually gone reports "Session expired".
const createRenewalError = () => {
  if (authService.getSessionStatus().authenticated) {
    return Object.assign(new Error(SESSION_RENEWAL_FAILED_MESSAGE), { code: 'SESSION_RENEWAL_FAILED' });
  }
  return new Error(SESSION_ERROR_MESSAGE);
};

/**
 * Resolves the bearer token for the next request. When the local expiry has
 * passed but a refresh token exists, the token is renewed first instead of the
 * request being rejected. Without a session the session is ended and it throws.
 */
export const getRequestToken = async () => {
  const status = authService.getSessionStatus();
  if (!status.authenticated) {
    authService.expireSession(status.reason || 'session_invalid');
    throw new Error(SESSION_ERROR_MESSAGE);
  }
  if (!status.needsRefresh) return status.snapshot.token;

  const token = await authService.refreshSession();
  if (!token) throw createRenewalError();
  return token;
};

const readResponsePayload = async (response) => {
  const text = await response.clone().text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * True when the backend rejected the access token: 401, or 403 whose body says
 * not authenticated / session expired / invalid or expired token. Other 403s
 * (e.g. "Access authority denied this entrypoint") are permission denials.
 */
export const isRefreshableAuthFailure = async (response) => {
  if (!response) return false;
  if (isAuthExpiredStatus(response.status)) return true;
  if (Number(response.status) !== 403) return false;
  return isAuthExpiredResponse(403, await readResponsePayload(response));
};

/**
 * Sends a request with the current token. If the token is rejected, refreshes
 * once and retries with the new token; the session ends only when the refresh
 * token is refused or the retried request is rejected again.
 *
 * @param {(token: string) => Promise<Response>} send
 */
export const sendWithSessionRefresh = async (send) => {
  const token = await getRequestToken();
  const response = await send(token);
  if (!(await isRefreshableAuthFailure(response))) return response;

  const nextToken = await authService.refreshSession({ rejectedToken: token });
  if (!nextToken) throw createRenewalError();

  const retried = await send(nextToken);
  if (await isRefreshableAuthFailure(retried)) authService.expireSession('token_rejected');
  return retried;
};
