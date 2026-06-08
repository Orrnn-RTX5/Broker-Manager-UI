const REDACTED = '[REDACTED]';

const SENSITIVE_QUERY_KEYS = new Set([
  'id',
  'token',
  'access_token',
  'refresh_token',
  'password',
  'pass',
  'master_pass',
  'investor_pass',
  'secret',
  'otp',
]);

// N4-02: narrowed so it no longer over-redacts benign diagnostic fields.
//   - dropped the blanket `url`/`uri` key match (it corrupted `*_url`/`*_uri`
//     diagnostics; actual secret-bearing URL *values* are still scrubbed by
//     redactUrl's substring pass), and
//   - tightened the bare `pass` match to real password-ish keys
//     (password/passphrase/passwd and the *_pass family) so it stops matching
//     words like "passenger"/"passed".
const SENSITIVE_KEY_PATTERN = /(authorization|token|passwd|passphrase|password|(^|[_-])pass$|secret|otp|credential|bearer)/i;

const browserOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

export const redactUrl = (value = '') => {
  const raw = String(value || '');
  if (!raw) return raw;

  const redactPlainText = (text) => text
    .replace(/([?&](?:id|token|access_token|refresh_token|password|pass|master_pass|investor_pass|secret|otp)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/Bearer\s+[^,\s}]+/gi, `Bearer ${REDACTED}`)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/wss?:\/\/[^\s"'<>]+/gi, '[REDACTED_WS_URL]');

  if (!/^(?:[a-z][a-z\d+.-]*:\/\/|\/|\?)/i.test(raw)) {
    return redactPlainText(raw);
  }

  try {
    const url = new URL(raw, browserOrigin());
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redactPlainText(raw);
  }
};

export const redactHeaders = (headers = {}) => {
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers || {});
  return entries.reduce((acc, [key, value]) => {
    acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
    return acc;
  }, {});
};

export const redactSensitive = (value) => {
  if (value == null) return value;
  if (typeof value === 'string') return redactUrl(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactUrl(value.message),
      status: value.status,
      code: value.code,
    };
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(item);
    return acc;
  }, {});
};
