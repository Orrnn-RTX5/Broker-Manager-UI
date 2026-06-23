import { useEffect, useRef, useState } from 'react';
import {
  buildFeedWsUrl,
  FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE,
  getFeedWsDisabledMessage,
} from '../config/endpoints';
import { fetchSymbolMetadataFallback, getSymbolName } from '../services/symbolMetadata';
import { extractFeedTicks } from '../utils/feedMessages';

const hasFeedQueryToken = (wsUrl = '') => {
  const raw = String(wsUrl || '');
  if (!raw) return false;

  try {
    const url = new URL(raw, 'http://rtx.local');
    return Boolean(String(url.searchParams.get('token') || '').trim());
  } catch {
    const query = raw.split('?')[1]?.split('#')[0];
    if (!query) return false;
    try {
      return Boolean(String(new URLSearchParams(query).get('token') || '').trim());
    } catch {
      return false;
    }
  }
};

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
    let cancelled = false;
    const symbolSet = new Set(initialSymbolList);

    const finish = (errorMessage = '') => {
      if (cancelled) return;
      const nextSymbols = Array.from(symbolSet).sort();
      setSymbols(nextSymbols);
      setLoading(false);
      setRefreshing(false);
      setError(errorMessage);
      onSymbolsRef.current?.(nextSymbols);
    };

    const mergeFallbackSymbols = async () => {
      const result = await fetchSymbolMetadataFallback();
      if (Array.isArray(result.symbols)) {
        result.symbols.forEach((entry) => {
          const symbol = getSymbolName(entry);
          if (symbol) symbolSet.add(symbol);
        });
      }
      return result;
    };

    const start = async () => {
      const fallback = await mergeFallbackSymbols().catch(() => null);
      if (symbolSet.size > 0) {
        const nextSymbols = Array.from(symbolSet).sort();
        setSymbols(nextSymbols);
        setLoading(false);
        setRefreshing(true);
        onSymbolsRef.current?.(nextSymbols);
      }

      let wsUrl;
      try {
        wsUrl = buildFeedWsUrl();
      } catch (err) {
        finish(getFeedWsDisabledMessage(err));
        return;
      }

      if (fallback?.feedAuthRequired && !hasFeedQueryToken(wsUrl)) {
        finish(FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE);
        return;
      }

      setError('');
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        finish('Market feed unavailable: websocket connection could not be started.');
        return;
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: ['*'] }));
      };

      ws.onmessage = (event) => {
        try {
          extractFeedTicks(event.data).forEach((tick) => {
            if (tick.symbol) symbolSet.add(tick.symbol);
          });
        } catch {
          // Ignore malformed feed frames; a later frame can still add symbols.
        }
      };

      timer = setTimeout(() => {
        finish();
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }, timeoutMs);

      ws.onerror = () => {
        clearTimeout(timer);
        finish('Market feed unavailable: websocket connection failed.');
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    };

    start();

    return () => {
      cancelled = true;
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
