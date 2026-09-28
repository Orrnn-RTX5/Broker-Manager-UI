const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAX_ROWS = 6_000;
const DEFAULT_CONCURRENCY = 4;

const count = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const abortIfNeeded = (signal) => {
  if (signal?.aborted) {
    throw signal.reason || new DOMException('Aborted', 'AbortError');
  }
};

const pageRows = (page) => Array.isArray(page?.rows) ? page.rows : null;

const result = (deals, complete, total = null) => ({
  deals,
  complete,
  partial: !complete,
  total,
});

/**
 * Collect a complete, bounded deal book from a paged manager endpoint.
 * fetchPage receives { offset, limit, signal } and returns a normalized page.
 * A short first page may be an undocumented server page-size cap, so it is
 * probed before accepting an inferred total as the end of the book.
 */
export async function collectDashboardDealPages({
  firstPage,
  fetchPage,
  signal,
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage must be a function');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 ||
      !Number.isSafeInteger(maxRows) || maxRows < 1 ||
      !Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Pagination limits must be positive integers');
  }
  abortIfNeeded(signal);

  const initialRows = pageRows(firstPage);
  if (!initialRows || initialRows.length > pageSize || initialRows.length > maxRows) {
    return result([], false, count(firstPage?.total));
  }
  const firstTotal = count(firstPage?.total);
  if (firstTotal !== null && firstTotal > maxRows) return result(initialRows, false, firstTotal);
  if (initialRows.length === 0) {
    return result([], firstTotal === 0 && firstPage.hasMore === false, firstTotal);
  }
  if (firstTotal !== null && firstTotal < initialRows.length) {
    return result(initialRows, false, firstTotal);
  }

  const deals = [...initialRows];
  const signatures = new Set();
  const tickets = new Set();
  const addIdentity = (rows) => {
    const signature = JSON.stringify(rows);
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    for (const row of rows) {
      const ticket = String(row?.ticket ?? '').trim();
      if (!ticket || ticket === '0') continue;
      if (tickets.has(ticket)) return false;
      tickets.add(ticket);
    }
    return true;
  };
  if (!addIdentity(initialRows)) return result(deals, false, firstTotal);

  const request = async (offset) => {
    abortIfNeeded(signal);
    const page = await fetchPage({ offset, limit: pageSize, signal });
    abortIfNeeded(signal);
    return page;
  };

  // A first-page total larger than that page establishes both a known target
  // and the effective server page size. Other cases scan until an empty page,
  // because normalized responses can infer an incorrect end at a server cap.
  if (firstTotal !== null && firstTotal > initialRows.length) {
    const stride = initialRows.length;
    const offsets = [];
    for (let offset = stride; offset < firstTotal; offset += stride) offsets.push(offset);
    let lastPage = firstPage;

    for (let start = 0; start < offsets.length; start += concurrency) {
      const batchOffsets = offsets.slice(start, start + concurrency);
      const pages = await Promise.all(batchOffsets.map(request));
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const offset = batchOffsets[index];
        const rows = pageRows(page);
        const expected = Math.min(stride, firstTotal - offset);
        const reportedTotal = count(page?.total);
        // A normalized short page can infer offset + rows.length as its total.
        // Any other changed total means the book changed during pagination.
        if (!rows || rows.length !== expected ||
            (reportedTotal !== null && reportedTotal !== firstTotal &&
              reportedTotal !== offset + rows.length) ||
            !addIdentity(rows)) {
          return result(deals, false, firstTotal);
        }
        deals.push(...rows);
        lastPage = page;
      }
    }
    if (deals.length !== firstTotal) return result(deals, false, firstTotal);
    if (lastPage.hasMore) {
      const next = await request(firstTotal);
      const rows = pageRows(next);
      if (!rows || rows.length || next.hasMore) return result(deals, false, firstTotal);
    }
    return result(deals, true, firstTotal);
  }

  const stride = initialRows.length;
  let offset = stride;
  let confirmedStride = false;
  while (offset <= maxRows) {
    // Confirm one continuation before speculating over offsets. After that,
    // full-size pages establish a stable stride for limited parallel batches.
    const batchOffsets = confirmedStride
      ? Array.from({ length: concurrency }, (_, index) => offset + index * stride)
        .filter((candidate) => candidate <= maxRows)
      : [offset];
    const pages = await Promise.all(batchOffsets.map(request));
    let terminal = null;

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const pageOffset = batchOffsets[index];
      const rows = pageRows(page);
      const reportedTotal = count(page?.total);
      if (!rows || rows.length > stride || reportedTotal > maxRows ||
          (reportedTotal !== null && reportedTotal < pageOffset + rows.length)) {
        return result(deals, false, firstTotal);
      }
      if (terminal !== null) {
        // Speculative pages beyond a discovered end must also be empty.
        if (rows.length || page.hasMore) return result(deals, false, firstTotal);
        continue;
      }
      if (rows.length === 0) {
        if (page.hasMore) return result(deals, false, firstTotal);
        terminal = { offset: pageOffset, needsProbe: false };
        continue;
      }
      if (deals.length + rows.length > maxRows || !addIdentity(rows)) {
        return result(deals, false, firstTotal);
      }
      deals.push(...rows);
      if (rows.length < stride) {
        if (page.hasMore) return result(deals, false, firstTotal);
        terminal = { offset: pageOffset + rows.length, needsProbe: true };
      }
    }

    if (terminal !== null) {
      if (terminal.needsProbe) {
        const probe = await request(terminal.offset);
        const probeRows = pageRows(probe);
        if (!probeRows || probeRows.length || probe.hasMore) {
          return result(deals, false, firstTotal);
        }
      }
      return result(deals, true, deals.length);
    }
    confirmedStride = true;
    offset = batchOffsets.at(-1) + stride;
  }
  return result(deals, false, firstTotal);
}
