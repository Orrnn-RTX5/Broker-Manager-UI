// A fresh `[]` causes grids that report rows through a parent effect to update
// that parent again on every loading/error render. Keep the empty snapshot
// referentially stable so the loading state paints once.
export const EMPTY_PAGED_ROWS = Object.freeze([]);

export const getPagedRows = (data, enabled = true) => (
  enabled ? data?.rows ?? EMPTY_PAGED_ROWS : EMPTY_PAGED_ROWS
);
