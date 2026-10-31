import {
  positionModifyStops,
  positionPriceChange,
  positionVolumeChange,
  positionCommentChange,
  positionForceClose,
  positionForceCloseAll,
  positionFlip,
} from '../../../services/tradeApi';

// Trade-tab adapter for open POSITIONS.
// Shape is consumed by TradeTab.jsx inside AccountDetailsModal.
export default {
  entity: 'position',
  label: 'Position',
  modifyStops: positionModifyStops,

  // Inline-editable cells (double-click a cell in the Trade tab table).
  editableFields: {
    stoploss:   { label: 'S/L',    step: 0.00001, precision: 5 },
    takeprofit: { label: 'T/P',    step: 0.00001, precision: 5 },
    price:      { label: 'Price',  step: 0.00001, precision: 5 },
    volume:     { label: 'Volume', step: 0.01,    precision: 2 },
    comment:    { label: 'Comment' },
  },

  // Commit an inline edit for the given field.
  modifyField: ({ ticket, field, value }) => {
    switch (field) {
      case 'stoploss':   return positionModifyStops({ ticket, stoploss: value });
      case 'takeprofit': return positionModifyStops({ ticket, takeprofit: value });
      case 'price':      return positionPriceChange(ticket, value);
      case 'volume':     return positionVolumeChange(ticket, value);
      case 'comment':    return positionCommentChange({ ticket, comment: value });
      default: throw new Error(`Unknown field: ${field}`);
    }
  },

  // Buttons rendered on the Trade tab for a selected position row.
  actions: [
    {
      key: 'flip',
      label: 'Flip',
      tone: 'secondary',
      title: 'Close and open opposite direction',
      run: ({ ticket }) => positionFlip(ticket),
    },
    {
      key: 'forceClose',
      label: 'Force Close',
      tone: 'danger',
      title: 'Close at the current market price',
      run: ({ ticket }) => positionForceClose({ ticket }),
    },
    {
      key: 'forceCloseAll',
      label: 'Force Close All',
      tone: 'danger-outline',
      title: 'Close every open position on this login at the current market price',
      run: ({ login }) => positionForceCloseAll({ login }),
    },
  ],
};
