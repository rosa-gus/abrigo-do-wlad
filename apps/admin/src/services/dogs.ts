import {
  dogEntitySchema,
  type Dog,
  type DogInput,
  type DogUpdate,
} from "../../shared/entities";
import { ApiError, apiRequest, revisionHeaders } from "./api";
import { pageQuery, type AdminPage } from "./pagination";

export async function addDog(dogData: DogInput) {
  await apiRequest<{ id: string; documentId: string }>("/api/admin/dogs", {
    method: "POST",
    body: JSON.stringify(dogData),
  });
  return true;
}

export async function getDogsPage(state: "active" | "archived" = "active", cursor?: string | null): Promise<AdminPage<Dog>> {
  const page = await apiRequest<AdminPage<unknown>>(`/api/admin/dogs?state=${state}${pageQuery(cursor)}`);
  return { items: dogEntitySchema.array().parse(page.items), nextCursor: page.nextCursor };
}
export async function getDogs(state: "active" | "archived" = "active"): Promise<Dog[]> {
  return (await getDogsPage(state)).items;
}

export function dogRouteId(dog: Pick<Dog, "documentId">): string {
  return `doc:${dog.documentId}`;
}

export async function archiveDog(id: string | number, adoptedViaSite: boolean, revision: string | undefined) {
  await apiRequest(
    `/api/admin/dogs/${encodeURIComponent(id)}/archive`,
    {
      method: "POST",
      headers: revisionHeaders(revision),
      body: JSON.stringify({ reason: adoptedViaSite ? "adopted_via_site" : "other" }),
    },
  );
  return true;
}

export async function restoreDog(id: string | number, revision: string | undefined): Promise<void> {
  await apiRequest(`/api/admin/dogs/${encodeURIComponent(id)}/restore`, { method: "POST", headers: revisionHeaders(revision) });
}

export async function getDogById(id: string | number): Promise<Dog | null> {
  try {
    return dogEntitySchema.parse(
      await apiRequest<unknown>(`/api/admin/dogs/${encodeURIComponent(id)}`),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function updateDog(id: string | number, data: DogUpdate) {
  await apiRequest(`/api/admin/dogs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: revisionHeaders(data.expectedUpdateTime),
    body: JSON.stringify(data),
  });
  return true;
}

export async function deleteDraftDog(id: string | number, revision: string | undefined): Promise<void> {
  await apiRequest(`/api/admin/dogs/${encodeURIComponent(id)}`, { method: "DELETE", headers: revisionHeaders(revision) });
}
