import {

  orderApprove,
  orderReject,
} from '../../../services/tradeApi';
import { cancelManagerPendingOrder, modifyManagerPendingOrder } from '../../../services/managerTradeApi';

// Trade-tab adapter for pending ORDERS.
// Shape matches position.js so TradeTab can swap adapters based on entity prop.
export default {
  entity: 'order',
  label: 'Order',
  modifyStops: ({ ticket, login, price, stoploss, takeprofit }) =>
    modifyManagerPendingOrder({ ticket, login, price, stoploss, takeprofit }),

  editableFields: {
    price:      { label: 'Price', step: 0.00001, precision: 5 },
    stoploss:   { label: 'S/L',   step: 0.00001, precision: 5 },
    takeprofit: { label: 'T/P',   step: 0.00001, precision: 5 },
  },

  modifyField: ({ ticket, login, field, value }) => {
    switch (field) {
      case 'price':      return modifyManagerPendingOrder({ ticket, login, price: value });
      case 'stoploss':   return modifyManagerPendingOrder({ ticket, login, stoploss: value });
      case 'takeprofit': return modifyManagerPendingOrder({ ticket, login, takeprofit: value });
      default: throw new Error(`Field ${field} is not editable on orders`);
    }
  },

  actions: [
    {
      key: 'approve',
      label: 'Approve',
      tone: 'primary',
      title: 'Approve dealer-queued order',
      run: ({ ticket, comment }) => orderApprove({ ticket, comment }),
    },
    {
      key: 'reject',
      label: 'Reject',
      tone: 'warn',
      title: 'Reject dealer-queued order',
      run: ({ ticket, comment }) => orderReject({ ticket, comment: comment || 'Rejected by manager' }),
    },
    {
      key: 'delete',
      label: 'Cancel Order',
      tone: 'danger',
      title: 'Cancel pending order',
      run: ({ ticket, login }) => cancelManagerPendingOrder({ ticket, login }),
    },
  ],
};
