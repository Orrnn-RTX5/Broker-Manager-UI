import { buildManagerApiUrl } from '../config/endpoints';
import authService from './authService';

const AUTH_REJECTION_STATUSES = new Set([401, 403]);
const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

const isLoginEndpoint = (endpoint) =>
  endpoint.startsWith('/Connect') || endpoint.includes('/Connect?');

export const fetchManagerApi = async (endpoint, options) => {
  const shouldRequireSession = !isLoginEndpoint(endpoint);

  if (shouldRequireSession) {
    const sessionStatus = authService.getSessionStatus();
    if (!sessionStatus.authenticated) {
      authService.expireSession(sessionStatus.reason || 'session_invalid');
      throw new Error(SESSION_ERROR_MESSAGE);
    }
  }

  const response = await fetch(buildManagerApiUrl(endpoint), options);

  if (shouldRequireSession && AUTH_REJECTION_STATUSES.has(response.status)) {
    authService.expireSession('token_rejected');
  }

  return response;
};
