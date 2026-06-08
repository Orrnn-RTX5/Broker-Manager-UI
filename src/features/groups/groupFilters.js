export const filterGroupsBySearch = (groups, search) => {
  const source = Array.isArray(groups) ? groups.filter(Boolean) : [];
  const query = String(search || '').trim().toLowerCase();

  if (!query) return source;

  return source.filter(group =>
    String(group?.name ?? '').toLowerCase().includes(query)
  );
};
