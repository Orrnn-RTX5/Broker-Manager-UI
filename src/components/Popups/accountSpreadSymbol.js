// Pure spread-override symbol helper (SUI follow-up to the fabricated-symbol
// class: no invented symbol may reach the wire).
//
// The per-symbol spread override sends whatever symbol the operator typed to
// POST /AccountSpreadSet. The control must start blank and refuse to submit
// blank — never fall back to a hardcoded symbol. Tenant-agnostic: no symbol,
// broker, group, or account literals.
export const normalizeSpreadSymbol = (value) => String(value ?? '').trim();

/** True only when the value names an explicit symbol to send. */
export const hasSpreadSymbol = (value) => normalizeSpreadSymbol(value) !== '';
