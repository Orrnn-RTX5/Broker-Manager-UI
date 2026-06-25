const getDesktopHttpBridge = () => (
  typeof window !== 'undefined' && typeof window.rtx5DesktopHttp?.request === 'function'
    ? window.rtx5DesktopHttp
    : null
);

const createAbortError = () => {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw createAbortError();
};

const headersToObject = (headers = {}) => {
  const out = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const normalizeBody = (body) => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob || body instanceof FormData || body instanceof ArrayBuffer) {
    throw new Error('Desktop HTTP bridge only supports text request bodies.');
  }
  return String(body);
};

export const isDesktopHttpBridgeAvailable = () => Boolean(getDesktopHttpBridge());

export const desktopFetch = async (url, options = {}) => {
  const bridge = getDesktopHttpBridge();
  if (!bridge) return fetch(url, options);

  throwIfAborted(options.signal);

  const result = await bridge.request({
    url: String(url),
    method: options.method || 'GET',
    headers: headersToObject(options.headers),
    body: normalizeBody(options.body),
  });

  throwIfAborted(options.signal);

  const body = [204, 205, 304].includes(Number(result.status))
    ? null
    : result.body || '';

  return new Response(body, {
    status: result.status,
    statusText: result.statusText || '',
    headers: result.headers || {},
  });
};
