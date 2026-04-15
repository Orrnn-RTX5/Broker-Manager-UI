import { dealUpdate } from '../../../services/tradeApi';

// Trade-tab adapter for historical DEALS.
// Deals are settled/closed — the admin can correct fields via DealUpdate.
// Only fields supported by the DealUpdate endpoint spec are exposed here.
export default {
  entity: 'deal',
  label: 'Deal',

  editableFields: {
    price:      { label: 'Price',      step: 0.00001, precision: 5 },
    profit:     { label: 'Profit',     step: 0.01,    precision: 2 },
    commission: { label: 'Commission', step: 0.01,    precision: 2 },
    storage:    { label: 'Swap',       step: 0.01,    precision: 2 },
    fee:        { label: 'Fee',        step: 0.01,    precision: 2 },
    lots:       { label: 'Volume',     step: 0.01,    precision: 2 },
    comment:    { label: 'Comment' },
  },

  // DealUpdate requires `deal` (the ticket) plus only the changed field.
  modifyField: ({ ticket, field, value }) =>
    dealUpdate({ deal: ticket, [field]: value }),

  // Deals have no live "actions" — all mutations happen via inline edits above.
  actions: [],
};
