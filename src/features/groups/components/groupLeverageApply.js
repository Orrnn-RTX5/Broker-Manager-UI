// Pure apply flow for the group-leverage sync (SUI-M1).
//
// Viewing the Accounts tab never writes. Pushing the group leverage onto
// member accounts happens solely through the explicit, confirmed
// "Apply group leverage" button, which calls applyGroupLeverage with
// confirm:true and reports the returned succeeded/failed counts.
//
// Lives in its own module (not in GroupAccountsTab.jsx) so the component
// file exports only the component, and so both helpers are directly
// unit-testable. Tenant-agnostic: no tenant, broker, group, or account
// literals; values flow from the selected group and its members.
import { groupNameKey, readLeverageRatio } from '../groupAccountRows.js';

// In-flight registry: the group names with an apply write running. It lives at module level, so
// it survives a tab switch or remount (component state would not). Keyed by the exact group name
// (case-sensitive, trim only, like group identity). Components subscribe so Apply re-renders when
// a write starts or ends. An entry is always cleared in `finally` by the caller.
const inFlightGroupApplies = new Set();
const registryListeners = new Set();

const notifyRegistry = () => {
  for (const listener of registryListeners) listener();
};

/** Marks a group's apply as started. False when that group already has a write in flight. */
export const beginGroupApply = (groupName) => {
  const key = groupNameKey(groupName);
  if (!key || inFlightGroupApplies.has(key)) return false;
  inFlightGroupApplies.add(key);
  notifyRegistry();
  return true;
};

/** Clears a group's in-flight mark. Call from `finally`. */
export const endGroupApply = (groupName) => {
  if (inFlightGroupApplies.delete(groupNameKey(groupName))) notifyRegistry();
};

export const isGroupApplyInFlight = (groupName) => inFlightGroupApplies.has(groupNameKey(groupName));

/** Subscribes to registry changes (for useSyncExternalStore). Returns the unsubscribe function. */
export const subscribeGroupApply = (listener) => {
  registryListeners.add(listener);
  return () => { registryListeners.delete(listener); };
};

/**
 * Push the group leverage onto members whose leverage differs. Returns
 * { succeeded, failed, total }. Never writes unless confirm is true and a
 * working updateAccount function is provided.
 *
 * expectedGroup is the exact (case-sensitive, trim only) group name. Members of
 * any other group are skipped. Every PATCH carries `ExpectedGroup` = the
 * member's stored group value byte-exact (B1 contract), so the backend refuses
 * (409 ACCOUNT_GROUP_MISMATCH) an account that left the group.
 */
export const applyGroupLeverage = async ({ members, groupLeverage, confirm, updateAccount, expectedGroup }) => {
  const leverage = readLeverageRatio({ leverage: groupLeverage });
  const group = String(expectedGroup ?? '').trim();
  if (!confirm || !leverage || typeof updateAccount !== 'function' || !group) {
    return { succeeded: 0, failed: 0, total: 0, succeededLogins: [] };
  }
  const storedGroup = (member) => String(member?.storedGroup ?? member?.group ?? member?.Group ?? member?.accountGroup ?? member?.AccountGroup ?? '');
  const candidates = (members || []).filter((member) => {
    const login = member?.login;
    return login !== undefined && login !== null && String(login).trim() !== '' && storedGroup(member).trim() === group;
  });
  const stale = candidates.filter((member) => (readLeverageRatio(member) ?? leverage) !== leverage);
  let succeeded = 0;
  let failed = 0;
  const succeededLogins = [];
  for (const member of stale) {
    try {
      await updateAccount(member.login, { Leverage: leverage, ExpectedGroup: storedGroup(member) });
      succeeded += 1;
      succeededLogins.push(member.login);
    } catch {
      failed += 1;
    }
  }
  return { succeeded, failed, total: stale.length, succeededLogins };
};

/**
 * Copy for the explicit apply-leverage confirm step, rendered through the
 * app's shared DepositDialog (status="confirm") rather than a bespoke dialog.
 * Pure so the exact title/message/labels are unit-testable.
 */
export const buildApplyConfirmCopy = ({ groupRatio, count }) => {
  const ratio = Number(groupRatio);
  if (groupRatio === null || groupRatio === undefined || !Number.isFinite(ratio) || ratio <= 0) {
    return {
      title: 'Apply group leverage',
      message: 'Group leverage is not set for this group, so there is nothing to apply.',
      confirmLabel: 'Apply',
    };
  }
  return {
    title: 'Apply group leverage',
    message: `Apply group leverage 1 : ${groupRatio} to ${count} accounts? Only accounts with a different leverage will be updated.`,
    confirmLabel: 'Apply',
  };
};
