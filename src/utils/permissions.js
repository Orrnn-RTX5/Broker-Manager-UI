// Pure client-side RBAC decision logic.
//
// This is a UX / defence-in-depth layer ONLY. Every dangerous route and action
// is also gated server-side by the backend RequirePermission middleware, which
// remains the sole real authority. The client gate exists to stop a
// low-privilege manager from reaching dangerous views and money/state buttons,
// and to avoid issuing requests that will be rejected anyway.
//
// Permission keys used by the money/state action surfaces. Keep these in sync
// with the backend permission catalogue. Admins (is_admin / wildcard) bypass
// all of them.
export const PERMISSIONS = {
  MANAGE_ACCOUNTS: 'manage_accounts',     // AccountCreate / UserUpdate / AccountDelete / Archive / Restore
  DEPOSIT_FUNDS: 'deposit_funds',         // Legacy UI key; deposit UI must use manage_finances.
  MANAGE_PASSWORDS: 'manage_passwords',   // UserPasswordChange / UserPasswordCheck
  MANAGE_RESTRICTIONS: 'manage_restrictions', // Legacy blended key; action gates use edit_accounts/manipulate_trades.
  MANAGE_FINANCES: 'manage_finances',
  DEPOSIT: 'deposit',
  CREDIT: 'credit',
  EDIT_ACCOUNTS: 'edit_accounts',
  MANIPULATE_TRADES: 'manipulate_trades',
  MANAGE_TRADES: 'manage_trades',
  MANAGE_GROUPS: 'manage_groups',
  MANAGE_IB: 'manage_ib',                 // IB create/update/delete, commission payout, plans, links
  VIEW_ACCOUNTS: 'view_accounts',
  VIEW_POSITIONS: 'view_positions',
  DEALER_QUEUE: 'dealer_queue',
};

export const ADMIN_WILDCARD = '*';

export const PERMISSION_ALIASES = {
  [PERMISSIONS.MANAGE_PASSWORDS]: [PERMISSIONS.MANAGE_ACCOUNTS],
};

export const expandPermissionKeys = (permission) => {
  if (!permission) return [];
  return [permission, ...(PERMISSION_ALIASES[permission] || [])];
};

/**
 * Decide whether the current session is allowed to perform an action requiring
 * `permission`, given the resolved permission state.
 *
 * Fail-CLOSED semantics for non-admins:
 *  - Admins (is_admin or wildcard "*") always pass.
 *  - No `permission` argument => no specific permission required => pass.
 *  - While the permission set is still loading (and we have no admin signal) we
 *    return `true` ONLY so the UI does not flicker a denial; callers that gate a
 *    state-changing action MUST additionally check `resolved` before firing.
 *  - Once the permission set has resolved (loaded, or errored) for a non-admin,
 *    access is granted ONLY if the explicit permission is present. An ERROR
 *    fetching manager auth/me therefore denies (fail-closed), it no longer grants.
 *
 * @param {Object}   p
 * @param {boolean}  p.isAdmin       - synchronous admin claim OR wildcard holder
 * @param {string[]} p.permissions   - resolved permission list
 * @param {boolean}  p.isLoading     - manager session query still loading
 * @param {boolean}  p.isError       - manager session query errored
 * @param {string}   [permission]    - permission key to check
 * @returns {boolean}
 */
export const decidePermission = (
  { isAdmin = false, permissions = [], isLoading = false, isError = false } = {},
  permission
) => {
  const list = Array.isArray(permissions) ? permissions : [];
  const hasWildcard = isAdmin || list.includes(ADMIN_WILDCARD);
  if (hasWildcard) return true;
  if (!permission) return true;

  // Non-admin. If the permission set has not yet finished loading AND has not
  // errored, defer the denial (avoid flicker) — but this is NOT an authorization
  // grant: `isResolved` is false here and action callers must respect it.
  if (isLoading && !isError) return true;

  // Resolved (loaded or errored). Fail-closed: only an explicit grant passes.
  // On error, `list` is empty, so this returns false -> access denied.
  return expandPermissionKeys(permission).some((key) => list.includes(key));
};

/**
 * Whether the permission decision is final (safe for a non-admin to act on).
 * Admins are always resolved. A non-admin is resolved once manager auth/me has
 * loaded or errored.
 */
export const isPermissionResolved = ({ isAdmin = false, isLoading = false, isError = false } = {}) =>
  Boolean(isAdmin) || !isLoading || Boolean(isError);

export default { PERMISSIONS, ADMIN_WILDCARD, PERMISSION_ALIASES, expandPermissionKeys, decidePermission, isPermissionResolved };
