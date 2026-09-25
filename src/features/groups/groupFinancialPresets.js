// Standard values offered in the group form's Financial dropdowns. Every field
// still accepts any other value through its "Custom…" option.

const leverage = (ratio) => ({ value: ratio, label: `1:${ratio}` });
const percent = (level) => ({ value: level, label: `${level}%` });

export const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 25, 30, 33, 50, 66, 100, 200, 300, 400, 500, 1000, 2000].map(leverage);

export const MARGIN_CALL_PRESETS = [50, 80, 100, 120, 150, 200].map(percent);

export const STOP_OUT_PRESETS = [10, 20, 30, 40, 50, 60, 80, 100].map(percent);

export const SPREAD_MARKUP_PRESETS = [
  { value: 0, label: 'No markup' },
  ...[1, 2, 3, 5, 10, 15, 20, 30, 50].map((points) => ({ value: points, label: `${points} point${points === 1 ? '' : 's'}` })),
];

/** Defaults for a brand-new group (edit and duplicate keep the source values). */
export const NEW_GROUP_FINANCIAL_DEFAULTS = {
  leverage: 100,
  marginCallLevel: 100,
  stopOutLevel: 50,
  spreadMarkup: 0,
};

/** True when `value` is one of the presets (compared as numbers). */
export const isPresetValue = (presets, value) => (
  value !== '' && value !== null && value !== undefined
  && presets.some((preset) => preset.value === Number(value))
);
