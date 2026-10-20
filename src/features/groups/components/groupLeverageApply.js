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
import { readLeverageRatio } from '../groupAccountRows.js';

/**
 * Push the group leverage onto members whose leverage differs. Returns
 * { succeeded, failed, total }. Never writes unless confirm is true and a
 * working updateAccount function is provided.
 */
export const applyGroupLeverage = async ({ members, groupLeverage, confirm, updateAccount }) => {
  const leverage = readLeverageRatio({ leverage: groupLeverage });
  if (!confirm || !leverage || typeof updateAccount !== 'function') {
    return { succeeded: 0, failed: 0, total: 0, succeededLogins: [] };
  }
  const candidates = (members || []).filter((member) => {
    const login = member?.login;
    return login !== undefined && login !== null && String(login).trim() !== '';
  });
  const stale = candidates.filter((member) => (readLeverageRatio(member) ?? leverage) !== leverage);
  let succeeded = 0;
  let failed = 0;
  const succeededLogins = [];
  for (const member of stale) {
    try {
      await updateAccount(member.login, { Leverage: leverage });
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
