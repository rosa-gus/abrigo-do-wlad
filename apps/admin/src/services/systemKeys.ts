import type { RotatedSystemKey, SystemKey } from "../types/systemKeys";
import { apiRequest, apiResource, revisionHeaders } from "./api";

export function getSystemKeys(): Promise<SystemKey[]> {
  return apiRequest<SystemKey[]>("/api/admin/system-keys");
}

export function getSystemKeysResource() {
  return apiResource<SystemKey[]>("/api/admin/system-keys");
}

export function rotateSystemKey(revision?: string): Promise<RotatedSystemKey> {
  return apiRequest<RotatedSystemKey>("/api/admin/system-keys/rotate", {
    method: "POST",
    headers: revisionHeaders(revision),
  });
}
