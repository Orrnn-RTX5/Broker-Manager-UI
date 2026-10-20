/**
 * Pure copy helpers for account transaction messages.
 *
 * Tenant-agnostic: no broker names, currencies, endpoints, or keys here.
 * Typography is inherited from callers (universal 11px/400); this module
 * emits no markup or styles.
 */

/**
 * Join a pre-formatted money amount with its currency code.
 *
 * Returns `amount + ' ' + currency`, omitting the separating space when
 * the currency is blank (empty, nullish, or whitespace-only) so callers
 * never render a double space such as "1,000.00  into".
 *
 * @param {string|number} formattedAmount Already-formatted amount (e.g. "1,000.00").
 * @param {string|null|undefined} currency Currency code (e.g. "USD") or blank.
 * @returns {string} The joined "amount currency" string, or just the amount.
 */
export function joinMoneyAmount(formattedAmount, currency) {
  const amount = String(formattedAmount ?? '');
  const code = String(currency ?? '').trim();
  if (!code) {
    return amount;
  }
  return `${amount} ${code}`;
}
