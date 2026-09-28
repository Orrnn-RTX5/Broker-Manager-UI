// /ConnectionStatus reports the manager's current connection, not a server
// inventory. Only explicit backend states can be shown as connected/disconnected.
export const normalizeManagerConnection = (response) => {
  const payload = response?.data ?? response;
  const connection = Array.isArray(payload) ? payload[0] : payload;
  const rawStatus = connection?.status;
  const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';

  return {
    state: status === 'connected' || status === 'disconnected' ? status : 'unavailable',
    login: connection?.login ?? null,
  };
};
