import { create } from 'zustand';
import { normalizeResult } from '../utils/resultMessage.js';

let nextId = 0;
export const useResultDialogStore = create((set) => ({
  queue: [],
  dismiss: () => set(state => ({ queue: state.queue.slice(1) })),
}));

export function showResult(message, options) {
  const result = { ...normalizeResult(message, options), id: ++nextId };
  useResultDialogStore.setState(state => ({ queue: [...state.queue, result] }));
}
showResult.error = (message, options) => showResult(message, { ...options, type: 'error' });
showResult.success = (message, options) => showResult(message, { ...options, type: 'success' });
showResult.info = (message, options) => showResult(message, { ...options, type: 'info' });
