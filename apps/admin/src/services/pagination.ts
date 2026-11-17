export interface AdminPage<T> { items: T[]; nextCursor: string | null }
export function pageQuery(cursor?: string | null): string {
  return cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
}
