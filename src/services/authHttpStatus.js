const AUTH_EXPIRED_MESSAGE_PATTERN =
  /(not\s+authenticated|unauthenticated|invalid\s+token|expired\s+token|token\s+expired|jwt\s+expired|session\s+expired|authentication\s+expired)/i;

const collectMessageParts = (payload, parts = []) => {
  if (!payload) return parts;

  if (typeof payload === 'string') {
    parts.push(payload);
    return parts;
  }

  if (payload instanceof Error) {
    parts.push(payload.message);
    return parts;
  }

  if (Array.isArray(payload)) {
    payload.forEach((entry) => collectMessageParts(entry, parts));
    return parts;
  }

  if (typeof payload === 'object') {
    ['error', 'message', 'detail', 'reason', 'title', 'description'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        collectMessageParts(payload[key], parts);
      }
    });
  }

  return parts;
};

export const isAuthExpiredStatus = (status) => Number(status) === 401;

export const isAuthExpiredMessage = (payload) =>
  AUTH_EXPIRED_MESSAGE_PATTERN.test(collectMessageParts(payload).join(' '));

export const isAuthExpiredResponse = (status, payload) =>
  isAuthExpiredStatus(status) || (Number(status) === 403 && isAuthExpiredMessage(payload));

export const isPermissionDeniedStatus = (status) => Number(status) === 403;
