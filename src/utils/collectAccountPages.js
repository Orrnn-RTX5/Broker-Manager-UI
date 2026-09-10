// Follow the server's cursor, including servers that cap the requested page size.
export const collectAccountPages = async (fetchPage, { signal } = {}) => {
  const accounts = new Map();
  let offset = 0;
  while (true) {
    signal?.throwIfAborted();
    const page = await fetchPage(offset);
    signal?.throwIfAborted();
    const previousSize = accounts.size;
    for (const row of page.rows || []) accounts.set(String(row.login), row);
    if (!page.hasMore) {
      return { rows: [...accounts.values()], total: accounts.size, hasMore: false, nextOffset: null };
    }
    const nextOffset = page.nextOffset ?? offset + (page.rows?.length || 0);
    if (nextOffset <= offset || accounts.size === previousSize) {
      throw new Error('The server did not advance the accounts list. Please retry.');
    }
    offset = nextOffset;
  }
};
