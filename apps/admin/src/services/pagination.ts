export type { AdminPage } from "@abrigo/contracts/admin";
export function pageQuery(cursor?: string | null): string {
  return cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
}
