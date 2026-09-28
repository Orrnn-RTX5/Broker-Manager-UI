const GROUP_PAGE_SIZE = 200;
const MAX_GROUP_PAGES = 25;

// A zero alert count is valid only after every configured group was read.
export const collectDashboardGroups = async (fetchPage, { signal } = {}) => {
  const rows = [];
  let offset = 0;
  for (let pageIndex = 0; pageIndex < MAX_GROUP_PAGES; pageIndex += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    const page = await fetchPage({
      search: '',
      sort_by: 'name',
      sort_dir: 'asc',
      limit: GROUP_PAGE_SIZE,
      offset,
    }, { signal });
    if (!page || !Array.isArray(page.rows)) return { rows, complete: false };
    rows.push(...page.rows);
    if (!page.hasMore) {
      const total = page.total == null || page.total === '' ? null : Number(page.total);
      return {
        rows,
        complete: total === null || (Number.isFinite(total) && total === rows.length),
      };
    }
    const nextOffset = Number(page.nextOffset);
    const followingOffset = Number.isFinite(nextOffset) && nextOffset > offset
      ? nextOffset
      : offset + page.rows.length;
    if (!page.rows.length || followingOffset <= offset) break;
    offset = followingOffset;
  }
  return { rows, complete: false };
};
