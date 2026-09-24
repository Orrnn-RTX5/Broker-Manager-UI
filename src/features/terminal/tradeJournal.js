import { subscribeToPositionSync } from '../../services/positionSync.js';
import { addTradeJournalListener, recordPositionMutation } from './tradeJournalCore.js';

export * from './tradeJournalCore.js';

let journalWired = false;

// Starts forwarding position sync events into the journal on first use. The
// feed stays wired for the rest of the session so entries keep accumulating
// even while the terminal tab is not visible.
export const wireTradeJournal = () => {
  if (journalWired) return;
  journalWired = true;
  subscribeToPositionSync((event) => {
    if (event?.type !== 'position') return;
    try {
      recordPositionMutation(event.payload);
    } catch {
      // Journal bookkeeping must never break the position sync pump.
    }
  });
};

export const subscribeToTradeJournal = (listener) => {
  wireTradeJournal();
  return addTradeJournalListener(listener);
};
