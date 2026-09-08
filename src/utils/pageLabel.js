export const formatPageLabel = (page, totalPages) => (
  totalPages === null || totalPages === undefined
    ? `Page ${page + 1}`
    : `Page ${page + 1} of ${totalPages}`
);
