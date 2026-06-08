import { useEffect, useRef, useState } from 'react';
import { buildFeedWsUrl, getFeedWsDisabledMessage } from '../config/endpoints';

export const useFeedSymbols = ({ initialSymbols = [], timeoutMs = 3000, onSymbols } = {}) => {
  const [initialSymbolList] = useState(() => Array.isArray(initialSymbols) ? initialSymbols : []);
  const onSymbolsRef = useRef(onSymbols);
  const [symbols, setSymbols] = useState(initialSymbolList);
  const [loading, setLoading] = useState(initialSymbolList.length === 0);
  const [refreshing, setRefreshing] = useState(initialSymbolList.length > 0);
  const [error, setError] = useState('');

  useEffect(() => {
    onSymbolsRef.current = onSymbols;
  }, [onSymbols]);

  useEffect(() => {
    let ws;
    let timer;
    let clearErrorTimer;
    const symbolSet = new Set(initialSymbolList);

    let wsUrl;
    try {
      wsUrl = buildFeedWsUrl();
    } catch (err) {
      const nextSymbols = Array.from(symbolSet).sort();
      const errorMessage = getFeedWsDisabledMessage(err);
      const disabledTimer = window.setTimeout(() => {
        setSymbols(nextSymbols);
        setLoading(false);
        setRefreshing(false);
        setError(errorMessage);
      }, 0);

      return () => window.clearTimeout(disabledTimer);
    }

    clearErrorTimer = window.setTimeout(() => {
      setError('');
    }, 0);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['*'] }));
    };

    ws.onmessage = (event) => {
      try {
        const messages = event.data.trim().split('\n');
        for (let i = 0; i < messages.length; i += 1) {
          if (!messages[i]) continue;
          const msg = JSON.parse(messages[i]);
          if (msg.symbol) symbolSet.add(msg.symbol);
        }
      } catch {
        // Ignore malformed feed frames; a later frame can still add symbols.
      }
    };

    const finish = () => {
      const nextSymbols = Array.from(symbolSet).sort();
      setSymbols(nextSymbols);
      setLoading(false);
      setRefreshing(false);
      onSymbolsRef.current?.(nextSymbols);
    };

    timer = setTimeout(() => {
      finish();
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }, timeoutMs);

    ws.onerror = () => {
      clearTimeout(clearErrorTimer);
      clearTimeout(timer);
      setSymbols(Array.from(symbolSet).sort());
      setLoading(false);
      setRefreshing(false);
      setError('Market feed unavailable: websocket connection failed.');
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    return () => {
      clearTimeout(clearErrorTimer);
      clearTimeout(timer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [timeoutMs, initialSymbolList]);

  return { symbols, loading, refreshing, error };
};

export default useFeedSymbols;
