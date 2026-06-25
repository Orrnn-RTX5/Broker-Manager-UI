export type SortDirection = 'asc' | 'desc';

export interface PagedQuery {
  limit?: number;
  offset?: number;
  search?: string;
  sort_by?: string;
  sort_dir?: SortDirection;
  filters?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>;
}

export interface PagedResult<T> {
  rows: T[];
  total: number | null;
  hasMore: boolean;
  nextOffset: number | null;
  limit: number;
  offset: number;
}
