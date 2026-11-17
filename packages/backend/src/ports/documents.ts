/** Versioned data crossing application boundaries; revisions are kept verbatim. */
export interface VersionedDocument<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  createTime?: string;
  updateTime?: string;
}
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface PageInput { limit: number; cursor?: string; publication?: "draft" | "published" | null }
export interface WriteResult { updateTime?: string }
