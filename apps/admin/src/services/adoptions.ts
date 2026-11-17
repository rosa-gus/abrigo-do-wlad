import { apiRequest, revisionHeaders } from "./api";
import { pageQuery, type AdminPage } from "./pagination";
import type { AdoptionStatus } from "../types/adoptions";

export async function getAdoptionApplications<T>(): Promise<T[]> {
  return (await getAdoptionApplicationsPage<T>()).items;
}

export async function getAdoptionApplicationsPage<T>(cursor?: string | null): Promise<AdminPage<T>> {
  return apiRequest<AdminPage<T>>(`/api/admin/adoptions?${pageQuery(cursor)}`);
}

export async function getAdoptionApplication<T>(id: string): Promise<T> {
  return apiRequest<T>(`/api/admin/adoptions/${encodeURIComponent(id)}`);
}

export async function updateAdoptionStatus(
  id: string,
  newStatus: AdoptionStatus,
  revision?: string,
) {
  return apiRequest<{ ok: boolean; status: AdoptionStatus; expiresAt: string; revision?: string }>(`/api/admin/adoptions/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: revisionHeaders(revision),
    body: JSON.stringify({ status: newStatus }),
  });
}
