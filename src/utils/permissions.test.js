// Unit tests for the pure client RBAC decision logic.
// Run with: node --test src/utils/permissions.test.js
//
// Covers the regressions from audit4:
//   NEW-02 — RBAC fail-OPEN on /SessionInfo error for non-admins (now fail-closed)
//   NEW-01 — money/state actions must be denied for non-admins lacking the grant
import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePermission, expandPermissionKeys, isPermissionResolved, PERMISSIONS } from './permissions.js';

const canAct = (state, perm) =>
  state.isAdmin ? true : (isPermissionResolved(state) ? decidePermission(state, perm) : false);

test('admins (is_admin) pass every permission', () => {
  const s = { isAdmin: true, permissions: [], isLoading: false, isError: false };
  assert.equal(decidePermission(s, PERMISSIONS.DEPOSIT_FUNDS), true);
  assert.equal(decidePermission(s, PERMISSIONS.MANAGE_ACCOUNTS), true);
  assert.equal(decidePermission(s, 'anything'), true);
});

test('wildcard "*" in permissions passes every permission', () => {
  const s = { isAdmin: false, permissions: ['*'], isLoading: false, isError: false };
  assert.equal(decidePermission(s, PERMISSIONS.MANAGE_PASSWORDS), true);
});

test('no permission argument => allowed (no specific permission required)', () => {
  const s = { isAdmin: false, permissions: [], isLoading: false, isError: false };
  assert.equal(decidePermission(s, undefined), true);
  assert.equal(decidePermission(s, ''), true);
});

test('NEW-02: non-admin whose SessionInfo ERRORED is DENIED (fail-closed, not fail-open)', () => {
  const s = { isAdmin: false, permissions: [], isLoading: false, isError: true };
  assert.equal(decidePermission(s, PERMISSIONS.DEPOSIT_FUNDS), false);
  assert.equal(decidePermission(s, PERMISSIONS.MANAGE_ACCOUNTS), false);
  // and the decision is considered resolved (final) on error
  assert.equal(isPermissionResolved(s), true);
});

test('NEW-02: non-admin with resolved permission set is allowed ONLY for granted permissions', () => {
  const s = { isAdmin: false, permissions: [PERMISSIONS.VIEW_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(decidePermission(s, PERMISSIONS.VIEW_ACCOUNTS), true);
  assert.equal(decidePermission(s, PERMISSIONS.DEPOSIT_FUNDS), false);
  assert.equal(decidePermission(s, PERMISSIONS.MANAGE_ACCOUNTS), false);
});

test('backend role permission aliases do not widen finance or restriction action gates', () => {
  assert.deepEqual(expandPermissionKeys(PERMISSIONS.DEPOSIT_FUNDS), [
    PERMISSIONS.DEPOSIT_FUNDS,
  ]);
  assert.deepEqual(expandPermissionKeys(PERMISSIONS.MANAGE_FINANCES), [
    PERMISSIONS.MANAGE_FINANCES,
  ]);
  assert.deepEqual(expandPermissionKeys(PERMISSIONS.MANAGE_PASSWORDS), [
    PERMISSIONS.MANAGE_PASSWORDS,
    PERMISSIONS.MANAGE_ACCOUNTS,
  ]);
  assert.deepEqual(expandPermissionKeys(PERMISSIONS.MANAGE_RESTRICTIONS), [
    PERMISSIONS.MANAGE_RESTRICTIONS,
  ]);

  const finance = { isAdmin: false, permissions: [PERMISSIONS.MANAGE_FINANCES], isLoading: false, isError: false };
  assert.equal(decidePermission(finance, PERMISSIONS.MANAGE_FINANCES), true, 'manage_finances can use deposit UI');

  const oldDeposit = { isAdmin: false, permissions: [PERMISSIONS.DEPOSIT], isLoading: false, isError: false };
  assert.equal(decidePermission(oldDeposit, PERMISSIONS.MANAGE_FINANCES), false, 'deposit alias cannot use deposit UI');

  const oldCredit = { isAdmin: false, permissions: [PERMISSIONS.CREDIT], isLoading: false, isError: false };
  assert.equal(decidePermission(oldCredit, PERMISSIONS.MANAGE_FINANCES), false, 'credit alias cannot use deposit UI');

  const oldDepositFunds = { isAdmin: false, permissions: [PERMISSIONS.DEPOSIT_FUNDS], isLoading: false, isError: false };
  assert.equal(decidePermission(oldDepositFunds, PERMISSIONS.MANAGE_FINANCES), false, 'deposit_funds does not satisfy manage_finances');

  const accounts = { isAdmin: false, permissions: [PERMISSIONS.MANAGE_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(decidePermission(accounts, PERMISSIONS.MANAGE_PASSWORDS), true, 'manage_accounts can use password UI');

  const editor = { isAdmin: false, permissions: [PERMISSIONS.EDIT_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(decidePermission(editor, PERMISSIONS.MANAGE_RESTRICTIONS), false, 'edit_accounts does not satisfy legacy blended key');

  const trader = { isAdmin: false, permissions: [PERMISSIONS.MANIPULATE_TRADES], isLoading: false, isError: false };
  assert.equal(decidePermission(trader, PERMISSIONS.MANAGE_RESTRICTIONS), false, 'manipulate_trades does not satisfy legacy blended key');
});

test('non-admin while still loading defers the denial (no flicker) but is NOT yet resolved', () => {
  const s = { isAdmin: false, permissions: [], isLoading: true, isError: false };
  // hasPermission-style decision defers (returns true to avoid a denial flicker)...
  assert.equal(decidePermission(s, PERMISSIONS.MANAGE_GROUPS), true);
  // ...but the state is NOT resolved, so action callers (canAct) must refuse.
  assert.equal(isPermissionResolved(s), false);
});

test('canAct semantics: a non-admin cannot act on an unresolved (still loading) permission set', () => {
  const loading = { isAdmin: false, permissions: [], isLoading: true, isError: false };
  assert.equal(canAct(loading, PERMISSIONS.MANAGE_FINANCES), false, 'must not act while loading');

  const errored = { isAdmin: false, permissions: [], isLoading: false, isError: true };
  assert.equal(canAct(errored, PERMISSIONS.MANAGE_FINANCES), false, 'must not act on error');

  const granted = { isAdmin: false, permissions: [PERMISSIONS.MANAGE_FINANCES], isLoading: false, isError: false };
  assert.equal(canAct(granted, PERMISSIONS.MANAGE_FINANCES), true, 'acts when explicitly granted');

  const admin = { isAdmin: true, permissions: [], isLoading: true, isError: false };
  assert.equal(canAct(admin, PERMISSIONS.MANAGE_FINANCES), true, 'admin always acts');
});

// N3-01 - AccountRestrictionsModal split:
//   AccountRestrictSet / AccountRestrictClear -> edit_accounts
//   AccountSpreadSet / AccountExecutionSet / AccountBookSet -> manipulate_trades
test('N3-01: account restriction actions use split backend permission keys', () => {
  const viewOnly = { isAdmin: false, permissions: [PERMISSIONS.VIEW_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(canAct(viewOnly, PERMISSIONS.EDIT_ACCOUNTS), false, 'set/clear denied without edit_accounts');
  assert.equal(canAct(viewOnly, PERMISSIONS.MANIPULATE_TRADES), false, 'spread/execution/book denied without manipulate_trades');

  const editor = { isAdmin: false, permissions: [PERMISSIONS.EDIT_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(canAct(editor, PERMISSIONS.EDIT_ACCOUNTS), true, 'set/clear allowed with edit_accounts');
  assert.equal(canAct(editor, PERMISSIONS.MANIPULATE_TRADES), false, 'edit_accounts does not allow spread/execution/book');

  const trader = { isAdmin: false, permissions: [PERMISSIONS.MANIPULATE_TRADES], isLoading: false, isError: false };
  assert.equal(canAct(trader, PERMISSIONS.EDIT_ACCOUNTS), false, 'manipulate_trades does not allow set/clear');
  assert.equal(canAct(trader, PERMISSIONS.MANIPULATE_TRADES), true, 'spread/execution/book allowed with manipulate_trades');

  const errored = { isAdmin: false, permissions: [], isLoading: false, isError: true };
  assert.equal(canAct(errored, PERMISSIONS.EDIT_ACCOUNTS), false, 'fail-closed on SessionInfo error for edit_accounts');
  assert.equal(canAct(errored, PERMISSIONS.MANIPULATE_TRADES), false, 'fail-closed on SessionInfo error for manipulate_trades');

  const loading = { isAdmin: false, permissions: [], isLoading: true, isError: false };
  assert.equal(canAct(loading, PERMISSIONS.EDIT_ACCOUNTS), false, 'must not set/clear while unresolved');
  assert.equal(canAct(loading, PERMISSIONS.MANIPULATE_TRADES), false, 'must not manipulate trades while unresolved');

  const admin = { isAdmin: true, permissions: [], isLoading: false, isError: false };
  assert.equal(canAct(admin, PERMISSIONS.EDIT_ACCOUNTS), true, 'admin can set/clear');
  assert.equal(canAct(admin, PERMISSIONS.MANIPULATE_TRADES), true, 'admin can manipulate trade overrides');
});

// F01 — IB / Groups / DealerQueue / Restriction page-level action buttons now
// re-guard their own state-changing handlers via canAct(...), matching the
// backend RequirePermission gate for those endpoints:
//   IBCommissionPay / IBDelete            -> manage_ib
//   GroupDelete / GroupMoveAccounts       -> manage_groups
//   OrderApprove / OrderReject            -> dealer_queue
//   AccountRestrictClear (page button)    -> edit_accounts
//   Navigator/NewGroupModal group create  -> manage_groups
// These assert the decision logic that drives those action guards.
test('F01: MANAGE_IB key matches the backend authority string', () => {
  // The backend gates every /IB* endpoint (incl. IBCommissionPay, IBDelete) on
  // "manage_ib". The client key MUST match so a non-admin holding manage_ib is
  // not falsely blocked, and one lacking it is denied.
  assert.equal(PERMISSIONS.MANAGE_IB, 'manage_ib');
});

test('F01: IB / Groups / DealerQueue action guards (canAct)', () => {
  // non-admin WITHOUT the relevant grant => every gated action is denied
  const viewOnly = { isAdmin: false, permissions: [PERMISSIONS.VIEW_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(canAct(viewOnly, PERMISSIONS.MANAGE_IB), false, 'IB payout/delete denied without manage_ib');
  assert.equal(canAct(viewOnly, PERMISSIONS.MANAGE_GROUPS), false, 'group create/delete/move denied without manage_groups');
  assert.equal(canAct(viewOnly, PERMISSIONS.DEALER_QUEUE), false, 'approve/reject denied without dealer_queue');
  assert.equal(canAct(viewOnly, PERMISSIONS.EDIT_ACCOUNTS), false, 'restriction clear denied without edit_accounts');

  // non-admin WITH the explicit grant => allowed
  const ibMgr = { isAdmin: false, permissions: [PERMISSIONS.MANAGE_IB], isLoading: false, isError: false };
  assert.equal(canAct(ibMgr, PERMISSIONS.MANAGE_IB), true, 'allowed with manage_ib');
  const grpMgr = { isAdmin: false, permissions: [PERMISSIONS.MANAGE_GROUPS], isLoading: false, isError: false };
  assert.equal(canAct(grpMgr, PERMISSIONS.MANAGE_GROUPS), true, 'allowed with manage_groups');
  const dealer = { isAdmin: false, permissions: [PERMISSIONS.DEALER_QUEUE], isLoading: false, isError: false };
  assert.equal(canAct(dealer, PERMISSIONS.DEALER_QUEUE), true, 'allowed with dealer_queue');
  const editor = { isAdmin: false, permissions: [PERMISSIONS.EDIT_ACCOUNTS], isLoading: false, isError: false };
  assert.equal(canAct(editor, PERMISSIONS.EDIT_ACCOUNTS), true, 'allowed with edit_accounts');

  // SessionInfo errored => fail-closed deny on all of them
  const errored = { isAdmin: false, permissions: [], isLoading: false, isError: true };
  assert.equal(canAct(errored, PERMISSIONS.MANAGE_IB), false, 'fail-closed on SessionInfo error (IB)');
  assert.equal(canAct(errored, PERMISSIONS.MANAGE_GROUPS), false, 'fail-closed on SessionInfo error (groups)');
  assert.equal(canAct(errored, PERMISSIONS.DEALER_QUEUE), false, 'fail-closed on SessionInfo error (dealer)');
  assert.equal(canAct(errored, PERMISSIONS.EDIT_ACCOUNTS), false, 'fail-closed on SessionInfo error (restrictions)');

  // still loading => actions must not fire (unresolved set)
  const loading = { isAdmin: false, permissions: [], isLoading: true, isError: false };
  assert.equal(canAct(loading, PERMISSIONS.MANAGE_IB), false, 'must not act while unresolved (IB)');

  // admin always allowed across the board
  const admin = { isAdmin: true, permissions: [], isLoading: false, isError: false };
  assert.equal(canAct(admin, PERMISSIONS.MANAGE_IB), true, 'admin always allowed (IB)');
  assert.equal(canAct(admin, PERMISSIONS.MANAGE_GROUPS), true, 'admin always allowed (groups)');
  assert.equal(canAct(admin, PERMISSIONS.DEALER_QUEUE), true, 'admin always allowed (dealer)');
  assert.equal(canAct(admin, PERMISSIONS.EDIT_ACCOUNTS), true, 'admin always allowed (restrictions)');
});
