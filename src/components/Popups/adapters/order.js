import { orderModify, orderDelete } from '../../../services/tradeApi';

// Trade-tab adapter for pending ORDERS.
// Orders = not-yet-filled; only stops modification + cancel are available.
export default {
  entity: 'order',
  label: 'Order',

  editableFields: {
    stoploss:   { label: 'S/L', step: 0.00001, precision: 5 },
    takeprofit: { label: 'T/P', step: 0.00001, precision: 5 },
  },

  modifyField: ({ ticket, field, value }) => {
    switch (field) {
      case 'stoploss':   return orderModify({ ticket, stoploss: value });
      case 'takeprofit': return orderModify({ ticket, takeprofit: value });
      default: throw new Error(`Unknown field: ${field}`);
    }
  },

  actions: [
    {
      key: 'cancel',
      label: 'Cancel Order',
      tone: 'danger',
      title: 'Delete this pending order',
      confirm: 'Cancel this pending order?',
      run: ({ ticket }) => orderDelete(ticket),
    },
  ],
};
