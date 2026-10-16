import { fetchManagerApi } from './managerFetch';
import { createAccountDetailsStore } from './accountDetailsCore';

const requestAccountDetails = async (loginId) => {
  const params = new URLSearchParams({ login: String(loginId) });
  const response = await fetchManagerApi(`/AccountDetails?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(response.ok ? 'Invalid account details response' : text || 'Failed to refresh account balance');
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Failed to refresh account balance');
  }

  return payload;
};

const accountDetailsStore = createAccountDetailsStore({ request: requestAccountDetails });
const accountSummaryStore = createAccountDetailsStore({
  request: async (login) => {
    const params = new URLSearchParams();
    params.append('login[]', login);
    const response = await fetchManagerApi(`/AccountsSummary?${params}`, { headers: { accept: 'application/json' } });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error('Invalid account summary response.'); }
    if (!response.ok) throw new Error(payload?.error || payload?.message || 'Unable to load account summary.');
    return payload;
  },
});

export const loadAccountDetails = accountDetailsStore.load;
export const peekAccountDetails = accountDetailsStore.peek;
export const prefetchAccountDetails = accountDetailsStore.prefetch;
export const seedAccountDetails = accountDetailsStore.seed;
export const updateCachedAccountDetails = accountDetailsStore.update;
// Account details hold personal data; drop them when the session ends.
export const clearAccountDetailsCache = () => {
  accountDetailsStore.clear();
  accountSummaryStore.clear();
};
export const subscribeToAccountDetails = accountDetailsStore.subscribe;
export const loadAccountSummary = accountSummaryStore.load;
export const peekAccountSummary = accountSummaryStore.peek;
export const prefetchAccountSummary = accountSummaryStore.prefetch;
export const subscribeToAccountSummary = accountSummaryStore.subscribe;

