/**
 * Socket Service Layer
 *
 * All functions here are STUBS. The socket is not connected until the backend is ready.
 *
 * To wire in a real socket (e.g., Socket.io):
 *   1. npm install socket.io-client
 *   2. Replace the stub below with:
 *      import { io } from 'socket.io-client';
 *      const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000');
 *   3. Export event subscription helpers.
 *
 * Example:
 *   export const subscribeToOnlineUsers = (callback) => {
 *     socket.on('online_users_update', callback);
 *     return () => socket.off('online_users_update', callback);
 *   };
 */

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

// ─── Connection State (stub) ───────────────────────────────────────────────────
export const getSocketState = () => ({
  connected: false,
  url: SOCKET_URL,
  status: 'NOT_CONNECTED', // 'CONNECTED', 'CONNECTING', 'DISCONNECTED', 'ERROR'
});

// ─── Event Subscriptions (stubs - return no-op unsubscribers) ─────────────────
export const subscribeToOnlineUsers = (_callback) => {
  // TODO: socket.on('online_users_update', callback)
  return () => {}; // unsubscribe no-op
};

export const subscribeToTradingAccounts = (_callback) => {
  // TODO: socket.on('trading_accounts_update', callback)
  return () => {};
};

export const subscribeToPositions = (_callback) => {
  // TODO: socket.on('positions_update', callback)
  return () => {};
};

export const subscribeToOrders = (_callback) => {
  // TODO: socket.on('orders_update', callback)
  return () => {};
};

export default {
  getSocketState,
  subscribeToOnlineUsers,
  subscribeToTradingAccounts,
  subscribeToPositions,
  subscribeToOrders,
};
