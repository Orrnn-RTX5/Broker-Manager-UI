import { GROUP_DEFAULT_PAYLOAD as defaultPayload, bookTypeForRoutingMode } from './groupPayload.js';
import { NEW_GROUP_FINANCIAL_DEFAULTS } from './groupFinancialPresets.js';
import { readLeverageRatio } from './groupAccountRows.js';

/**
 * Initial form state for the new-group wizard, extracted from
 * NewGroupModal.jsx's useState initializer so the composition is testable.
 *
 * Preserves the component's semantics for every path (fresh defaults plus
 * NEW_GROUP_FINANCIAL_DEFAULTS, presetName prefill, duplicate ' Copy' rename,
 * readLeverageRatio source leverage, canonical bookType normalization, and
 * symbol-array joining). Leverage: a fresh create (no initialData/
 * duplicateData source) starts blank (''); NewGroupModal pre-fills the
 * broker's group default leverage when it resolves, and a top-level submit
 * requires a whole number in the groupLeverage.js bounds. A source without a
 * readable leverage also starts blank (never 0). Edit/duplicate sources keep
 * their values and count as touched downstream via the component's
 * leverageTouched ref.
 *
 * Tenant-agnostic: no tenant, broker, group, currency, or symbol literals.
 */
export const buildNewGroupFormData = ({ initialData, duplicateData, presetName } = {}) => {
  const source = initialData || duplicateData;
  const data = { ...defaultPayload, ...(source ? {} : NEW_GROUP_FINANCIAL_DEFAULTS), ...(source || {}) };
  if (source) data.leverage = readLeverageRatio(source) ?? '';
  // Fresh creates start blank with a `Select leverage…` placeholder until the
  // broker default pre-fill (NewGroupModal) or the operator supplies a value.
  if (!source) data.leverage = '';
  if (duplicateData) data.name = `${duplicateData.name || 'New Group'} Copy`;
  // "Add group" inside a folder pre-fills the folder path, e.g. `PREP\demo\`.
  if (!source && presetName) data.name = presetName;
  // New groups trade by default; edits and duplicates keep their source value.
  if (!source) data.tradeAllowed = true;
  // The visible Book choice is routingMode; bookType is its backend-canonical
  // value (b/a/hybrid), never a display label.
  if (!source && data.routingMode) {
    const canonical = bookTypeForRoutingMode(data.routingMode);
    if (canonical) data.bookType = canonical;
  }
  if (source && data.routingMode) {
    const canonical = bookTypeForRoutingMode(data.routingMode);
    if (canonical) data.bookType = canonical;
  }
  if (Array.isArray(data.symbolsAllowed)) data.symbolsAllowed = data.symbolsAllowed.join(', ');
  if (Array.isArray(data.symbolsBlocked)) data.symbolsBlocked = data.symbolsBlocked.join(', ');
  return data;
};
