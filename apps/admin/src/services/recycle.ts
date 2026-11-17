import {
  recyclePointEntitySchema,
  type RecyclePoint,
  type RecyclePointInput,
  type RecyclePointUpdate,
} from "@abrigo/contracts/entities";
import { ApiError, apiRequest, revisionHeaders } from "./api";
import { pageQuery, type AdminPage } from "./pagination";

export async function addRecyclePoint(data: RecyclePointInput) {
  return (await apiRequest<{ id: string }>("/api/admin/recycle-points", {
    method: "POST",
    body: JSON.stringify(data),
  })).id;
}

export async function getRecyclePointsPage(cursor?: string | null): Promise<AdminPage<RecyclePoint>> {
  const page = await apiRequest<AdminPage<unknown>>(`/api/admin/recycle-points?${pageQuery(cursor)}`);
  return { items: recyclePointEntitySchema.array().parse(page.items), nextCursor: page.nextCursor };
}
export async function getRecyclePoints(): Promise<RecyclePoint[]> {
  return (await getRecyclePointsPage()).items;
}

export async function deleteRecyclePoint(id: string, revision?: string) {
  await apiRequest<void>(`/api/admin/recycle-points/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: revisionHeaders(revision),
  });
  return true;
}

export async function getRecyclePointById(id: string): Promise<RecyclePoint | null> {
  try {
    return recyclePointEntitySchema.parse(
      await apiRequest<unknown>(`/api/admin/recycle-points/${encodeURIComponent(id)}`),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function updateRecyclePoint(id: string, data: RecyclePointUpdate) {
  await apiRequest(`/api/admin/recycle-points/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: revisionHeaders(data.expectedUpdateTime),
    body: JSON.stringify(data),
  });
  return true;
}
