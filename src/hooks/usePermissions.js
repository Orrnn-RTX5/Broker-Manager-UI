import { useQuery } from '@tanstack/react-query';
import { fetchManagerApi } from '../services/managerFetch';
import authService from '../services/authService';
import { decidePermission, isPermissionResolved } from '../utils/permissions';
import { getPermissionSessionQueryKey } from '../utils/sessionFingerprint';

// Client-side RBAC. This is a UX / defence-in-depth layer only — every dangerous
// route and action is also gated server-side by RequirePermission middleware —
// but it stops non-privileged managers from reaching dangerous views and
// money/state buttons.
//
// Source of truth: the backend /SessionInfo endpoint returns
//   { is_admin: bool, role: string, permissions: string[] }
// where admins receive ["*"]. We additionally read is_admin synchronously from
// the login session blob so admins are never blocked while /SessionInfo loads.
//
// IMPORTANT (NEW-02 fix): for a NON-admin we are fail-CLOSED once the permission
// set has resolved (loaded OR errored). A /SessionInfo error therefore DENIES;
// it no longer grants every gate. `is_admin` from the login blob is treated as a
// UX convenience for admins only — it can never turn a denial into a grant for a
// gated permission because the backend remains the authority.

const fetchSessionInfo = async () => {
  const res = await fetchManagerApi('/SessionInfo', {
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid SessionInfo response');
  }
  if (!res.ok) throw new Error(data?.error || data?.message || 'Failed to load session info');
  return data;
};

export const usePermissions = () => {
  const claims = authService.getSessionClaims();
  const snapshot = authService.getAuthSnapshot();
  const queryKey = getPermissionSessionQueryKey({
    token: snapshot.token,
    login: claims.login,
    brokerId: claims.brokerId,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: fetchSessionInfo,
    enabled: Boolean(snapshot.token),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isAdmin = claims.isAdmin || data?.is_admin === true;
  const permissions = Array.isArray(data?.permissions) ? data.permissions : [];

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

  return {
    isAdmin,
    role: data?.role || (claims.isAdmin ? 'admin' : ''),
    permissions,
    loading: isLoading && !isAdmin,
    resolved,
    hasPermission,
    canAct,
  };
};

export default usePermissions;
