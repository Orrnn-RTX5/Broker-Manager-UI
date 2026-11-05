// Owner rule (2026-11-05): a group's account mode (hedging | netting) is chosen when the group is created and is
// never changed afterwards. Edit forms show it read-only, and an edit never sends marginMode.

export const GROUP_MODE_LOCKED_TEXT = 'Account mode is fixed after the group is created.';

/** An edit payload without marginMode, so a changed or tampered form can never send it. */
export const withoutGroupMarginMode = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { marginMode: _marginMode, ...rest } = payload;
  return rest;
};
