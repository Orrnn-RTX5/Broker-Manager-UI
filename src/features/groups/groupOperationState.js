export const isTerminalOperation = state => ['succeeded', 'failed'].includes(state);

// Only these replies establish that this submission was not accepted. Keep
// the same key after a transport/server/authentication failure: it may have
// committed before the response was lost.
export const canRefreshRejectedOperation = error => [
  'invalid_request', 'stale_preview', 'invalid_preview', 'confirmation_required',
  'validation_failed', 'blocked', 'operation_conflict', 'feature_disabled',
].includes(error?.code) && error?.status >= 400 && error?.status < 600;

export function validSavedOperation(value) {
  if (!value || typeof value !== 'object' || !value.selection) return false;
  const { folder, sources } = value.selection;
  const hasFolder = typeof folder === 'string' && folder.length > 0;
  const hasSources = Array.isArray(sources) && sources.length > 0 && sources.every(name => typeof name === 'string' && name.length > 0);
  if (hasFolder === hasSources) return false;
  return (typeof value.id === 'string' && value.id.length > 0) || (
    typeof value.submission?.preview_token === 'string' && value.submission.preview_token.length === 64 &&
    typeof value.submission?.idempotency_key === 'string' && value.submission.idempotency_key.length >= 16
  );
}

export function createGroupOperationKey(random = globalThis.crypto) {
  if (random?.randomUUID) return random.randomUUID();
  // getRandomValues also works on HTTP LAN development origins where
  // randomUUID is unavailable. The API accepts an opaque 16–128 byte key.
  if (!random?.getRandomValues) throw new Error('Secure request IDs are unavailable. Open this app over HTTPS or localhost.');
  return [...random.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function settingDifferences(sources, destination) {
  if (!Array.isArray(sources) || !destination || typeof destination !== 'object') return [];
  const keys = ['currency', 'leverage', 'margin_call_level', 'stop_out_level', 'commission_rate', 'commission_type',
    'swap_multiplier', 'spread_markup', 'symbols_allowed', 'symbols_blocked', 'max_lot_per_trade', 'max_total_lots',
    'execution_mode', 'routing_mode', 'lot_divisor', 'negative_balance_protection'];
  return sources.filter(source => source && typeof source === 'object').flatMap(source => keys
    .filter(key => JSON.stringify(source[key]) !== JSON.stringify(destination[key]))
    .map(key => ({ source: source.name, key, before: source[key], after: destination[key] })));
}
