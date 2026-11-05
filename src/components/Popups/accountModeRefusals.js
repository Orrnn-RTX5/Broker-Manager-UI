// Tenant-agnostic refusal mapping for account-mode and group-mode backend errors.
//
// Confirmed against backend source (C:\Users\Administrator\Desktop\RTX\Broker-Backend-V2, read-only):
// - ACCOUNT_MODE_UNSUPPORTED:        group_contract.go:302-307, engine_register.go:330-337
// - ENGINE_ACCOUNT_MODE_UNSUPPORTED: engine_register.go:102-103, engine_register.go:330-337
// - NETTING_REQUIRES_B_BOOK:         group_contract.go:282, group_contract.go:346-353, groups.go:353
// - ACCOUNT_MODE_GROUP_MISMATCH:     group_contract.go:280, group_contract.go:355-364
// - GROUP_MARGIN_MODE_IN_USE:        group_contract.go:283, group_contract.go:346-353, groups.go:1288, 1354, 1673
// - GROUP_MARGIN_MODE_MIXED:         group_contract.go:284, group_contract.go:346-353, groups.go:1200
// - GROUP_MARGIN_MODE_ENGINE_OWNED:  group_contract.go:285, group_contract.go:346-353, groups.go:1211, 1346
// - GROUP_MARGIN_MODE_MISMATCH:      group_contract.go:281, group_contract.go:346-353, accounts.go:4066, 4070
// - GROUP_MODE_WRITER_GRANT_MISSING: group_margin_modes.go:70, group_contract.go:346-353
// - GROUP_MARGIN_MODE_IMMUTABLE:     POST /GroupUpdate 409 when an update would change an existing group's effective
//                                    mode (explicit marginMode, or a parentGroup/inheritFields change); rtx-s1 contract
//                                    2026-11-05, owner rule: the mode is chosen at create only. Nothing is written.

/**
 * Human-readable explanations for backend HTTP 409 conflict codes
 * (§3 handoff table).
 */
export const ACCOUNT_MODE_REFUSAL_MESSAGES = Object.freeze({
  ACCOUNT_MODE_UNSUPPORTED: 'Netting is not enabled on this server yet.',
  ENGINE_ACCOUNT_MODE_UNSUPPORTED: 'Netting is not enabled on this server yet.',
  NETTING_REQUIRES_B_BOOK: 'Netting groups must use B-book routing.',
  ACCOUNT_MODE_GROUP_MISMATCH: 'Account mode must match the group (Netting).',
  GROUP_MARGIN_MODE_IN_USE: 'Close all positions in this group before changing its account mode.',
  GROUP_MARGIN_MODE_MIXED: 'This group (or its subgroups) has accounts in the other mode.',
  GROUP_MARGIN_MODE_ENGINE_OWNED: 'The trading engine owns these accounts; contact support.',
  GROUP_MARGIN_MODE_MISMATCH: 'An account can only move to a group with the same account mode.',
  GROUP_MODE_WRITER_GRANT_MISSING: 'The server is not set up to change account modes yet (admin action needed).',
  GROUP_MARGIN_MODE_IMMUTABLE: 'The account mode is fixed after the group is created. This change would alter it, so nothing was saved.',
});

/**
 * Extract a candidate machine error code from a response body or Error instance.
 * Checks engine_code first (critical for ACCOUNT_MODE_UNSUPPORTED where
 * code is generic MT_RET_ERR_DATA), then error_code, then code.
 */
export const extractRefusalCode = (input) => {
  if (!input) return '';
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return ACCOUNT_MODE_REFUSAL_MESSAGES[trimmed] ? trimmed : '';
  }
  if (typeof input === 'object') {
    // 1. engine_code takes precedence (engine_register.go:330-338)
    if (typeof input.engine_code === 'string' && input.engine_code.trim()) {
      return input.engine_code.trim();
    }
    // 2. error_code (group_contract.go:346-353)
    if (typeof input.error_code === 'string' && input.error_code.trim()) {
      return input.error_code.trim();
    }
    // 3. code
    if (typeof input.code === 'string' && input.code.trim()) {
      return input.code.trim();
    }
  }
  return '';
};

/**
 * Extract human-readable error or backend message from the error payload.
 */
export const extractRefusalMessage = (input) => {
  if (!input) return '';
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'object') {
    if (typeof input.message === 'string' && input.message.trim()) {
      return input.message.trim();
    }
    if (typeof input.error === 'string' && input.error.trim()) {
      return input.error.trim();
    }
    if (input.error && typeof input.error === 'object' && typeof input.error.message === 'string') {
      return input.error.message.trim();
    }
  }
  return '';
};

/**
 * Check if a known refusal code appears inside an error message string.
 */
const findKnownCodeInText = (text) => {
  if (typeof text !== 'string') return '';
  for (const code of Object.keys(ACCOUNT_MODE_REFUSAL_MESSAGES)) {
    if (text.includes(code)) return code;
  }
  return '';
};

/**
 * Maps an account/group mode error or refusal response to human-readable guidance.
 * - Mapped codes return their exact handoff §3 text.
 * - ACCOUNT_MODE_UNSUPPORTED is resolved via engine_code.
 * - Unknown codes keep today's behaviour: the backend message, never a raw code toast.
 */
export const resolveAccountModeRefusal = (errorOrResponse, fallback = 'An error occurred.') => {
  if (!errorOrResponse) return fallback;

  // 1. Check extracted machine code
  const code = extractRefusalCode(errorOrResponse);
  if (code && ACCOUNT_MODE_REFUSAL_MESSAGES[code]) {
    return ACCOUNT_MODE_REFUSAL_MESSAGES[code];
  }

  // 2. Check message text for embedded known codes
  const backendMessage = extractRefusalMessage(errorOrResponse);
  if (backendMessage) {
    const embeddedCode = findKnownCodeInText(backendMessage);
    if (embeddedCode && ACCOUNT_MODE_REFUSAL_MESSAGES[embeddedCode]) {
      return ACCOUNT_MODE_REFUSAL_MESSAGES[embeddedCode];
    }
    // Unknown code keeps today's behaviour: backend message
    return backendMessage;
  }

  return fallback;
};
