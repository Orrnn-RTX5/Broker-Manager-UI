import { fetchManagerApi } from './managerFetch.js';

const readCloseResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

/**
 * Close an open position through the versioned manager API.
 *
 * `fetchManagerApi` supplies the authenticated manager Bearer token. This must
 * remain a POST: the legacy mutating GET /OrderClose endpoint is disabled.
 */
export const closeManagerPosition = async (ticket) => {
  const response = await fetchManagerApi(
    `/api/v1/manager/orders/${encodeURIComponent(String(ticket))}/close`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }
  );
  const result = await readCloseResponse(response);

  if (!response.ok) {
    throw Object.assign(
      new Error(result?.message || 'Failed to close position'),
      { status: response.status }
    );
  }

  return result;
};

export default { closeManagerPosition };
