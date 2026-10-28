import { apiRequest } from "./api";
import type { AdoptionStatus } from "../types/adoptions";

export async function getAdoptionApplications<T>(): Promise<T[]> {
  return apiRequest<T[]>("/api/admin/adoptions");
}

export async function getAdoptionApplication<T>(id: string): Promise<T> {
  return apiRequest<T>(`/api/admin/adoptions/${encodeURIComponent(id)}`);
}

export async function updateAdoptionStatus(
  id: string,
  newStatus: AdoptionStatus,
) {
  return apiRequest<{ ok: boolean; status: AdoptionStatus; expiresAt: string }>(`/api/admin/adoptions/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: newStatus }),
  });
}
