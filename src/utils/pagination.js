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

const rowContainsSearch = (row, search) => {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  const values = Object.values(row || {});
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
};

const rowMatchesFilters = (row, filters = {}) => (
  Object.entries(filters).every(([key, expected]) => {
    if (!isPresent(expected)) return true;
    if (Array.isArray(expected)) {
      const allowed = expected.filter(isPresent).map((value) => String(value).toLowerCase());
      return allowed.length === 0 || allowed.includes(String(row?.[key] ?? row?.[key[0]?.toUpperCase?.() + key.slice(1)] ?? '').toLowerCase());
    }
    const actual = row?.[key] ?? row?.[key[0]?.toUpperCase?.() + key.slice(1)];
    return String(actual ?? '').toLowerCase() === String(expected).toLowerCase();
  })
);

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
  const arrayStart = findArrayStart(text, preferredKeys);
  if (arrayStart < 0) {
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

    if (matched >= offset) rows.push(normalizeRow(rawRow));
    matched += 1;

    if (Date.now() - lastYield > PARTIAL_PARSE_YIELD_MS) {
      await yieldToMainThread();
      throwIfAborted(options.signal);
      lastYield = Date.now();
    }
  }

  const total = readTotalFromText(text);
  const hasKnownTotal = total !== null;
  const hasMore = hasKnownTotal ? offset + rows.length < total : !reachedEnd && rows.length === limit;

  return {
    rows,
    total,
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
    throw new Error(errorPayload?.error || errorPayload?.message || text || `HTTP ${response.status}`);
  }

  if (!response.body) {
    const text = await response.text();
    return normalizePagedTextResult(text, query, normalizeRow, preferredKeys, options);
  }

  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const filters = query.filters && typeof query.filters === 'object' ? query.filters : {};
  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  const rows = [];
  let matched = 0;
  let total = null;
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
      } catch {
        await maybeYield();
        continue;
      }

      if (!rowContainsSearch(rawRow, query.search) || !rowMatchesFilters(rawRow, filters)) {
        await maybeYield();
        continue;
      }

      if (matched >= offset) rows.push(normalizeRow(rawRow));
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

            total = readTotalFromText(buffer.slice(0, arrayStart));
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

        total = readTotalFromText(buffer.slice(0, arrayStart));
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

  const hasKnownTotal = total !== null;
  const hasMore = hasKnownTotal ? offset + rows.length < total : !reachedEnd && rows.length === limit;

  return {
    rows,
    total,
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
  const rows = sourceRows.reduce((acc, rawRow) => {
    const normalizedRow = normalizeRow(rawRow);
    if (matchesPagedQuery(rawRow, normalizedRow, query)) acc.push(normalizedRow);
    return acc;
  }, []);
  const total = extractTotal(payload);
  const hasKnownTotal = total !== null;
  const hasMore = hasKnownTotal ? offset + rows.length < total : rows.length === limit;

  return {
    rows,
    total,
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
