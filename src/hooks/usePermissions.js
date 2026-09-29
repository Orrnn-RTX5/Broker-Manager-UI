import { getDataAccessIdentity, updateDataAccessScope } from '../services/dataAccessScope.js';
import { useQuery } from '@tanstack/react-query';
import { fetchManagerApi } from '../services/managerFetch';
import authService from '../services/authService';
import { decidePermission, isPermissionResolved } from '../utils/permissions';
import { getPermissionSessionQueryKey } from '../utils/sessionFingerprint';
import { MANAGER_API } from '../config/managerApiContract.js';
import { normalizeManagerSession } from '../utils/managerSession.js';

// Client-side RBAC. This is a UX / defence-in-depth layer only — every dangerous
// route and action is also gated server-side by RequirePermission middleware —
// but it stops non-privileged managers from reaching dangerous views and
// money/state buttons.
//
// Source of truth: the documented manager auth/me endpoint returns
//   { is_admin: bool, role: string, permissions: string[] }
// (directly or in a data/session envelope). We additionally read is_admin
// synchronously from the login session blob so admins are never blocked while it loads.
//
// IMPORTANT (NEW-02 fix): for a NON-admin we are fail-CLOSED once the permission
// set has resolved (loaded OR errored). A session-info error therefore DENIES;
// it no longer grants every gate. `is_admin` from the login blob is treated as a
// UX convenience for admins only — it can never turn a denial into a grant for a
// gated permission because the backend remains the authority.

const fetchSessionInfo = async () => {
  const identity = getDataAccessIdentity();
  const res = await fetchManagerApi(MANAGER_API.session, {
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid manager session response');
  }
  if (!res.ok) throw new Error(data?.error || data?.message || 'Failed to load session info');
  const session = data?.data || data?.session || data;
  if (identity !== getDataAccessIdentity()) throw new DOMException("Session changed", "AbortError");
  updateDataAccessScope(session, identity);
  return session;
};

export const usePermissions = () => {
  const claims = authService.getSessionClaims();
  const snapshot = authService.getAuthSnapshot();
  const queryKey = getPermissionSessionQueryKey({
    // Stable across token refreshes, so permissions are not reloaded hourly.
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: fetchSessionInfo,
    enabled: Boolean(snapshot.token),
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const manager = normalizeManagerSession(data, claims);
  const isAdmin = manager.isAdmin;
  const permissions = manager.permissions;

  const state = { isAdmin, permissions, isLoading, isError };
  const resolved = isPermissionResolved(state);

  // hasPermission: used by route/section guards. Defers denial while loading
  // (avoids flicker) but is fail-CLOSED once resolved for non-admins.
  const hasPermission = (permission) => decidePermission(state, permission);

  // canAct: used by state-changing action handlers/buttons. Stricter than
  // hasPermission — it never fires an action on an unresolved permission set, so
  // a non-admin cannot deposit/delete/etc. during the loading window.
  const canAct = (permission) => {
    if (isAdmin) return true;
    if (!resolved) return false;
    return decidePermission(state, permission);
  };

  // Access revisions from the session snapshot. They change when an administrator
  // edits this manager's role or access, even if the permission list looks the same.
  const accessRevision = [data?.access_revision, data?.assignment_revision, data?.policy_revision]
    .map((value) => (value === undefined || value === null ? '' : String(value)))
    .join(':');

  return {
    isAdmin,
    role: manager.role,
    accessRevision,
    manager,
    permissions,
    loading: isLoading && !isAdmin,
    resolved,
    hasPermission,
    canAct,
  };
};

export default usePermissions;
