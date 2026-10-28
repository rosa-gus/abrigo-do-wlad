import {
  dogEntitySchema,
  type Dog,
  type DogInput,
  type DogUpdate,
} from "../../shared/entities";
import { ApiError, apiRequest } from "./api";

export async function addDog(dogData: DogInput) {
  await apiRequest<{ id: number }>("/api/admin/dogs", {
    method: "POST",
    body: JSON.stringify(dogData),
  });
  return true;
}

export async function getDogs(state: "active" | "archived" = "active"): Promise<Dog[]> {
  return dogEntitySchema.array().parse(await apiRequest<unknown>(`/api/admin/dogs?state=${state}`));
}

export async function archiveDog(id: number, adoptedViaSite: boolean) {
  await apiRequest(
    `/api/admin/dogs/${encodeURIComponent(id)}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ reason: adoptedViaSite ? "adopted_via_site" : "other" }),
    },
  );
  return true;
}

export async function restoreDog(id: number): Promise<void> {
  await apiRequest(`/api/admin/dogs/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export async function getDogById(id: number): Promise<Dog | null> {
  try {
    return dogEntitySchema.parse(
      await apiRequest<unknown>(`/api/admin/dogs/${encodeURIComponent(id)}`),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function updateDog(id: number, data: DogUpdate) {
  await apiRequest(`/api/admin/dogs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return true;
}
