import { chunkSymbolNames } from '../utils/symbolParams.js';

const nameOf = row => String(typeof row === 'string' ? row : row?.symbol || row?.Symbol || row?.name || row?.Name || row?.symbol_name || row?.symbolName || '').trim();

async function runPool(items, request, concurrency = 4) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await request(items[next++]);
  }));
}

// Publish completed batches independently. A slow category or the last symbol
// batch must not hide data that the server has already returned.
export async function loadSymbolManagement({ getNames, getAvailableNames, getCategories, getParams, getCategorySymbols, onProgress, cachedSymbols = [] }) {
  const rows = new Map();
  const core = new Map();
  const metadata = new Map();
  const cached = new Map(cachedSymbols.map(row => [nameOf(row), row]));
  let categories = [];
  let metadataDone = false;
  let failed = false;
  let metadataFailed = false;
  let namesLoaded = false;
  let orderedSymbols = [];
  const rowIndexes = new Map();
  const rendered = [];
  const dirty = new Set();
  const managed = new Set();
  const requested = new Set();
  let membershipChanged = false;
  let lastMetadataDone = false;
  let lastFinished = false;

  const snapshot = (finished = false) => {
    // Batch arrivals affect only their own rows. Reuse the remaining objects
    // instead of sorting and merging the entire catalogue on every response.
    const rebuildAll = membershipChanged || metadataDone !== lastMetadataDone || finished !== lastFinished;
    if (membershipChanged) {
      orderedSymbols = [...rows.keys()].sort((a, b) => a.localeCompare(b));
      rowIndexes.clear();
      orderedSymbols.forEach((symbol, index) => rowIndexes.set(symbol, index));
      rendered.length = orderedSymbols.length;
      membershipChanged = false;
    }
    const updateRow = (symbol) => {
      const index = rowIndexes.get(symbol);
      if (index === undefined) return;
      const params = core.get(symbol);
      const extra = metadata.get(symbol);
      const feedOnly = !managed.has(symbol) && !params && !extra;
      const ready = Boolean(params && (extra || (metadataDone && !metadataFailed)));
      // Category records distinguish derived instruments. Resolve their type
      // immediately, without waiting for unrelated parameter batches.
      const symbolType = feedOnly ? undefined : extra ? (extra.symbolType || 'base')
        : params?.symbolType || rows.get(symbol)?.symbolType
          || (metadataDone && !metadataFailed ? 'base' : cached.get(symbol)?.symbolType);
      const row = {
        ...(feedOnly ? {} : cached.get(symbol)), ...rows.get(symbol), ...params, ...extra, symbol,
        ...(symbolType ? { symbolType } : {}),
        __managementPartial: !ready,
        __managementLoading: !finished,
        __managementFeedOnly: feedOnly,
      };
      rendered[index] = row;
    };
    if (rebuildAll || rendered.length !== orderedSymbols.length) {
      orderedSymbols.forEach(updateRow);
    } else {
      dirty.forEach(updateRow);
    }
    dirty.clear();
    lastMetadataDone = metadataDone;
    lastFinished = finished;
    return {
      // A snapshot owns its array; subsequent batches cannot mutate past data.
      symbols: rendered.slice(),
      categories,
      partial: !finished,
      error: finished && failed ? 'Some symbol details could not be loaded. Retry to fetch the missing data.' : '',
    };
  };
  let publicationQueued = false;
  let finished = false;
  const publish = () => {
    if (!namesLoaded || !onProgress || publicationQueued) return;
    // Responses resolving together should cause one UI update, not one render
    // per batch. This does not wait for a timer or for slow network requests.
    publicationQueued = true;
    queueMicrotask(() => {
      publicationQueued = false;
      if (!finished) onProgress(snapshot());
    });
  };

  const addRows = (data, isManaged = false) => {
    data.forEach(row => {
      const symbol = nameOf(row);
      if (!symbol) return;
      if (!rows.has(symbol)) {
        rows.set(symbol, { symbol });
        membershipChanged = true;
      }
      if (isManaged) {
        managed.add(symbol);
        if (typeof row === 'object') rows.set(symbol, { ...rows.get(symbol), ...row, symbol });
      }
      dirty.add(symbol);
    });
    namesLoaded = true;
    publish();
  };

  const hydrate = async (names) => {
    const pending = names.filter(symbol => !requested.has(symbol));
    pending.forEach(symbol => requested.add(symbol));
    await runPool(chunkSymbolNames(pending.sort((a, b) => a.localeCompare(b))), async batch => {
      try {
        const data = await getParams(batch);
        if (!Array.isArray(data)) throw new Error('Invalid symbol parameters');
        data.forEach(row => {
          const symbol = nameOf(row);
          if (symbol && rows.has(symbol)) {
            core.set(symbol, row);
            dirty.add(symbol);
          }
        });
        if (batch.some(symbol => managed.has(symbol) && !core.has(symbol))) failed = true;
        publish();
      } catch {
        // An empty successful response means settings are unavailable. Network
        // failures must stay retryable, including for feed-only instruments.
        failed = true;
      }
    });
  };

  const availableTask = getAvailableNames ? (async () => {
    try {
      const data = await getAvailableNames();
      if (!Array.isArray(data)) throw new Error('Invalid available symbol list');
      addRows(data);
    } catch { failed = true; }
  })() : Promise.resolve();

  const metadataTask = (async () => {
    try {
      categories = await getCategories();
      if (!Array.isArray(categories)) throw new Error('Invalid category response');
      publish();
      await runPool(categories, async category => {
        try {
          const data = await getCategorySymbols(category.name);
          if (!Array.isArray(data)) throw new Error('Invalid category symbols');
          addRows(data, true);
          data.forEach(row => {
            const symbol = nameOf(row);
            if (symbol) {
              metadata.set(symbol, { ...row, category: category.name });
              dirty.add(symbol);
            }
          });
          publish();
        } catch { failed = true; metadataFailed = true; }
      });
    } catch { categories = []; failed = true; metadataFailed = true; }
    metadataDone = true;
    publish();
  })();

  let namesError;
  try {
    const names = await getNames();
    if (!Array.isArray(names)) throw new Error('Invalid symbol list');
    addRows(names, true);
    // Match the table's alphabetical order so its first rows are requested first.
    await hydrate(names.map(nameOf).filter(Boolean));
  } catch (error) { namesError = error; }
  await Promise.all([metadataTask, availableTask]);
  // Unknown feed instruments must not cause a mixed batch to reject valid
  // category-only broker instruments on servers with strict parameter APIs.
  await hydrate([...managed]);
  await hydrate([...rows.keys()].filter(symbol => !managed.has(symbol)));
  if (namesError) failed = true;
  finished = true;
  if (namesError && rows.size === 0) throw namesError;
  const result = snapshot(true);
  onProgress?.(result);
  return result;
}
