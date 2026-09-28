export const DEFAULT_PAGE_LIMIT = 30;

const ROW_KEYS = ['rows', 'data', 'answer', 'records', 'items', 'groups', 'accounts', 'positions', 'orders', 'deals', 'users'];
const TOTAL_KEYS = ['total', 'total_count', 'totalCount', 'count'];
const PARTIAL_PARSE_YIELD_MS = 4;
const STREAM_DECODE_CHUNK_BYTES = 8 * 1024;

const isPresent = (value) => value !== undefined && value !== null && value !== '';

const normalizeLimit = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PAGE_LIMIT;
};

const normalizeOffset = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

export const normalizeSortDir = (value) => (
  String(value || '').toLowerCase() === 'desc' ? 'desc' : 'asc'
);

const appendParam = (params, key, value) => {
  if (Array.isArray(value)) {
    value.filter(isPresent).forEach((item) => params.append(key, String(item)));
  } else if (isPresent(value)) {
    params.set(key, String(value));
  }
};

export const buildPagedQueryParams = (query = {}) => {
  const params = new URLSearchParams();
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);

  params.set('limit', String(limit));
  params.set('offset', String(offset));

  appendParam(params, 'search', query.search?.trim?.() ?? query.search);
  appendParam(params, 'sort_by', query.sort_by);
  if (query.sort_by) params.set('sort_dir', normalizeSortDir(query.sort_dir));

  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  Object.entries(filters).forEach(([key, value]) => appendParam(params, key, value));

  return params;
};

export const buildPagedEndpoint = (endpoint, query = {}) => {
  const [path, existing = ''] = String(endpoint).split('?');
  const params = new URLSearchParams(existing);
  buildPagedQueryParams(query).forEach((value, key) => {
    if (params.has(key) && key !== 'limit' && key !== 'offset') params.append(key, value);
    else params.set(key, value);
  });
  return `${path}?${params.toString()}`;
};

export const extractRows = (payload, preferredKeys = []) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of [...preferredKeys, ...ROW_KEYS]) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  return [];
};

const extractTotal = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const key of TOTAL_KEYS) {
    const value = Number(payload[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
};

const yieldToMainThread = () => new Promise((resolve) => setTimeout(resolve, 0));

const createAbortError = () => {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw createAbortError();
};

const findArrayStart = (text, preferredKeys = []) => {
  const trimmedStart = text.search(/\S/);
  if (trimmedStart >= 0 && text[trimmedStart] === '[') return trimmedStart;

  for (const key of [...preferredKeys, ...ROW_KEYS]) {
    const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
    if (match) return match.index + match[0].lastIndexOf('[');
  }

  return -1;
};

const findJsonValueEnd = (text, start) => {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }

    if (depth === 0 && (char === ',' || char === ']')) return i;
  }

  return -1;
};

const readTotalFromText = (text) => {
  for (const key of TOTAL_KEYS) {
    const match = new RegExp(`"${key}"\\s*:\\s*(\\d+)`).exec(text);
    if (match) return Number(match[1]);
  }
  return null;
};

const readTotalFromHeaders = (headers) => {
  if (!headers?.get) return null;

  for (const key of ['x-total-count', 'x-total', 'total-count']) {
    const rawValue = headers.get(key);
    if (rawValue === null || rawValue === '') continue;
    const value = Number(rawValue);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  const contentRange = headers.get('content-range');
  const rangeTotal = /\/(\d+)\s*$/.exec(String(contentRange || ''));
  return rangeTotal ? Number(rangeTotal[1]) : null;
};

const rowContainsSearch = (row, search) => {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  const values = Object.values(row || {});
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
};

const matchesFilterValue = (rawVal, expected) => {
  if (!isPresent(expected)) return true;
  const expStr = String(expected).trim().toLowerCase();

  if (Array.isArray(expected)) {
    const allowed = expected.filter(isPresent).map((v) => String(v).trim().toLowerCase());
    if (allowed.length === 0) return true;
    const rawStr = String(rawVal ?? '').trim().toLowerCase();
    return allowed.includes(rawStr);
  }

  if (isPresent(rawVal)) {
    const rawStr = String(rawVal).trim().toLowerCase();
    if (rawStr === expStr) return true;
  }

  if (expStr === 'buy') {
    if (rawVal === 0 || rawVal === '0' || rawVal === 'buy' || rawVal === 'deal_buy') return true;
  } else if (expStr === 'sell') {
    if (rawVal === 1 || rawVal === '1' || rawVal === 'sell' || rawVal === 'deal_sell') return true;
  }

  if (expStr === 'client' && (rawVal === 0 || rawVal === '0' || rawVal === 'client')) return true;
  if (expStr === 'expert' && (rawVal === 1 || rawVal === '1' || rawVal === 'expert' || String(rawVal).toLowerCase().includes('expert') || String(rawVal).toLowerCase().includes('ea'))) return true;
  if (expStr === 'dealer' && (rawVal === 2 || rawVal === '2' || rawVal === 'dealer' || String(rawVal).toLowerCase().includes('dealer'))) return true;
  if (expStr === 'mobile' && (rawVal === 5 || rawVal === '5' || rawVal === 'mobile' || String(rawVal).toLowerCase().includes('mobile') || String(rawVal).toLowerCase().includes('ios') || String(rawVal).toLowerCase().includes('android'))) return true;

  return false;
};

const rowMatchesFilters = (row, filters = {}) => {
  if (!filters || typeof filters !== 'object') return true;
  const filterEntries = Object.entries(filters).filter(([, expected]) => isPresent(expected));
  if (filterEntries.length === 0) return true;

  return filterEntries.every(([key, expected]) => {
    const val = row?.[key];
    if (matchesFilterValue(val, expected)) return true;

    const capKey = key[0]?.toUpperCase?.() + key.slice(1);
    const capVal = row?.[capKey];
    if (matchesFilterValue(capVal, expected)) return true;

    if (key === 'type') {
      if (matchesFilterValue(row?.action ?? row?.Action ?? row?.side ?? row?.Side ?? row?.cmd ?? row?.Cmd, expected)) return true;
    }
    if (key === 'reason') {
      if (matchesFilterValue(row?.Reason ?? row?.comment ?? row?.Comment ?? row?.reason_type, expected)) return true;
    }

    return false;
  });
};

const matchesPagedQuery = (rawRow, normalizedRow, query = {}) => {
  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  const matchesSearch =
    rowContainsSearch(rawRow, query.search) ||
    rowContainsSearch(normalizedRow, query.search);
  const matchesFilters =
    rowMatchesFilters(rawRow, filters) ||
    rowMatchesFilters(normalizedRow, filters);

  return matchesSearch && matchesFilters;
};

export const normalizePagedTextResult = async (text, query = {}, normalizeRow = (row) => row, preferredKeys = [], options = {}) => {
  throwIfAborted(options.signal);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const rowOffset = options.serverPaged ? 0 : offset;
  const arrayStart = findArrayStart(text, preferredKeys);
  if (arrayStart < 0) {
    if (options.requireRowsArray) throw new Error('Invalid paged response: rows array is missing');
    return normalizePagedResult(JSON.parse(text), query, normalizeRow, preferredKeys);
  }

  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  const rows = [];
  let matched = 0;
  let cursor = arrayStart + 1;
  let lastYield = Date.now();
  let reachedEnd = false;

  while (cursor < text.length && rows.length < limit) {
    throwIfAborted(options.signal);
    while (cursor < text.length && /[\s,]/.test(text[cursor])) cursor += 1;
    if (text[cursor] === ']') {
      reachedEnd = true;
      break;
    }

    const valueEnd = findJsonValueEnd(text, cursor);
    if (valueEnd < 0) break;

    const itemText = text.slice(cursor, valueEnd);
    cursor = valueEnd;

    let rawRow;
    try {
      rawRow = JSON.parse(itemText);
      if (options.onRow) options.onRow(rawRow);
    } catch {
      continue;
    }

    if (!rowContainsSearch(rawRow, query.search) || !rowMatchesFilters(rawRow, filters)) {
      if (Date.now() - lastYield > PARTIAL_PARSE_YIELD_MS) {
        await yieldToMainThread();
        throwIfAborted(options.signal);
        lastYield = Date.now();
      }
      continue;
    }

    if (matched >= rowOffset) rows.push(normalizeRow(rawRow));
    matched += 1;

    if (Date.now() - lastYield > PARTIAL_PARSE_YIELD_MS) {
      await yieldToMainThread();
      throwIfAborted(options.signal);
      lastYield = Date.now();
    }
  }

  if (options.requireRowsArray && rows.length < limit && !reachedEnd) {
    throw new Error('Invalid paged response: rows array is incomplete');
  }

  const total = readTotalFromText(text);
  const hasKnownTotal = total !== null;
  const hasMore = hasKnownTotal
    ? offset + rows.length < total
    : options.serverPaged
      ? rows.length === limit
      : !reachedEnd && rows.length === limit;

  const resolvedTotal = total ?? (!hasMore
    ? (options.serverPaged ? offset + rows.length : matched)
    : null);

  return {
    rows,
    total: resolvedTotal,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
    limit,
    offset,
  };
};

export const normalizePagedStreamResult = async (response, query = {}, normalizeRow = (row) => row, preferredKeys = [], options = {}) => {
  const { signal } = options;
  throwIfAborted(signal);

  if (!response.ok) {
    const text = await response.text();
    let errorPayload = null;
    try {
      errorPayload = JSON.parse(text);
    } catch {
      // Keep the raw text as the fallback message below.
    }
    const candidates = [errorPayload?.error?.message, errorPayload?.error, errorPayload?.message];
    const serverMessage = candidates.find((value) => typeof value === 'string' && value.trim());
    const error = new Error(serverMessage?.trim().slice(0, 300) || (errorPayload ? `HTTP ${response.status}` : text || `HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }

  if (!response.body) {
    const text = await response.text();
    return normalizePagedTextResult(text, query, normalizeRow, preferredKeys, options);
  }

  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const rowOffset = options.serverPaged ? 0 : offset;
  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  const rows = [];
  let matched = 0;
  let total = readTotalFromHeaders(response.headers);
  let buffer = '';
  let arrayFound = false;
  let reachedEnd = false;
  let done = false;
  let lastYield = Date.now();

  const maybeYield = async () => {
    if (Date.now() - lastYield <= PARTIAL_PARSE_YIELD_MS) return;
    await yieldToMainThread();
    throwIfAborted(signal);
    lastYield = Date.now();
  };

  const parseBufferedRows = async () => {
    while (arrayFound && rows.length < limit) {
      throwIfAborted(signal);
      buffer = buffer.replace(/^[\s,]+/, '');
      if (!buffer) return;
      if (buffer[0] === ']') {
        reachedEnd = true;
        return;
      }

      const valueEnd = findJsonValueEnd(buffer, 0);
      if (valueEnd < 0) return;

      const itemText = buffer.slice(0, valueEnd);
      buffer = buffer.slice(valueEnd);

      let rawRow;
      try {
        rawRow = JSON.parse(itemText);
        if (options.onRow) options.onRow(rawRow);
      } catch {
        await maybeYield();
        continue;
      }

      if (!rowContainsSearch(rawRow, query.search) || !rowMatchesFilters(rawRow, filters)) {
        await maybeYield();
        continue;
      }

      if (matched >= rowOffset) rows.push(normalizeRow(rawRow));
      matched += 1;
      await maybeYield();
    }

    if (rows.length >= limit) {
      await reader.cancel();
    }
  };

  const abortReader = () => {
    reader.cancel().catch(() => {});
  };

  signal?.addEventListener?.('abort', abortReader, { once: true });

  try {
    while (!done && rows.length < limit && !reachedEnd) {
      throwIfAborted(signal);
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal?.aborted) throw createAbortError();
        throw error;
      }

      done = chunk.done;
      if (chunk.value) {
        for (let start = 0; start < chunk.value.byteLength && rows.length < limit && !reachedEnd; start += STREAM_DECODE_CHUNK_BYTES) {
          throwIfAborted(signal);
          const end = Math.min(start + STREAM_DECODE_CHUNK_BYTES, chunk.value.byteLength);
          buffer += decoder.decode(chunk.value.subarray(start, end), { stream: true });

          if (!arrayFound) {
            const arrayStart = findArrayStart(buffer, preferredKeys);
            if (arrayStart < 0) {
              if (buffer.length > 2048) buffer = buffer.slice(-2048);
              await maybeYield();
              continue;
            }

            const prefixTotal = readTotalFromText(buffer.slice(0, arrayStart));
            if (prefixTotal !== null) total = prefixTotal;
            buffer = buffer.slice(arrayStart + 1);
            arrayFound = true;
          }

          await parseBufferedRows();
          await maybeYield();
        }
      }

      if (done) {
        buffer += decoder.decode();
      }

      if (!arrayFound) {
        const arrayStart = findArrayStart(buffer, preferredKeys);
        if (arrayStart < 0) {
          if (buffer.length > 2048) buffer = buffer.slice(-2048);
          continue;
        }

        const prefixTotal = readTotalFromText(buffer.slice(0, arrayStart));
        if (prefixTotal !== null) total = prefixTotal;
        buffer = buffer.slice(arrayStart + 1);
        arrayFound = true;
      }

      await parseBufferedRows();
    }
  } finally {
    signal?.removeEventListener?.('abort', abortReader);
  }

  if (!arrayFound) {
    return normalizePagedTextResult(buffer, query, normalizeRow, preferredKeys, options);
  }

  if (options.requireRowsArray && rows.length < limit && !reachedEnd) {
    throw new Error('Invalid paged response: rows array is incomplete');
  }

  // APIs commonly place `total` after the rows array. When the terminal page
  // is smaller than the requested limit, the stream reaches that metadata and
  // can expose an exact page count instead of leaving the UI at `?`.
  if (total === null && reachedEnd) total = readTotalFromText(buffer);

  const hasKnownTotal = total !== null;
  const hasMore = hasKnownTotal
    ? offset + rows.length < total
    : options.serverPaged
      ? rows.length === limit
      : !reachedEnd && rows.length === limit;

  const resolvedTotal = total ?? (!hasMore
    ? (options.serverPaged ? offset + rows.length : matched)
    : null);

  return {
    rows,
    total: resolvedTotal,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
    limit,
    offset,
  };
};

export const normalizePagedResult = (payload, query = {}, normalizeRow = (row) => row, preferredKeys = []) => {
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const sourceRows = extractRows(payload, preferredKeys);
  const total = extractTotal(payload);
  const hasKnownTotal = total !== null;
  const needsLocalPagination = sourceRows.length > limit;
  const rowOffset = needsLocalPagination ? offset : 0;
  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  const rows = [];
  let matched = 0;
  let hasAdditionalRows = false;

  for (const rawRow of sourceRows) {
    const rawMatches = rowContainsSearch(rawRow, query.search) && rowMatchesFilters(rawRow, filters);
    let normalizedRow = null;

    if (!rawMatches) {
      normalizedRow = normalizeRow(rawRow);
      if (!matchesPagedQuery(rawRow, normalizedRow, query)) continue;
    }

    if (matched < rowOffset) {
      matched += 1;
      continue;
    }

    if (rows.length < limit) {
      rows.push(normalizedRow || normalizeRow(rawRow));
      matched += 1;
      continue;
    }

    hasAdditionalRows = true;
    break;
  }

  const hasMore = hasKnownTotal
    ? offset + rows.length < total
    : needsLocalPagination
      ? hasAdditionalRows
      : rows.length === limit;

  const resolvedTotal = total ?? (!hasMore ? offset + rows.length : null);

  return {
    rows,
    total: resolvedTotal,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
    limit,
    offset,
  };
};

export const getPagedDisplayRange = ({ offset = 0, rowsLength = 0, total = null } = {}) => {
  if (rowsLength === 0) return { start: 0, end: 0, totalLabel: total ?? 'many' };
  return {
    start: offset + 1,
    end: offset + rowsLength,
    totalLabel: total ?? 'many',
  };
};
