import type { AdminNotification, NotificationInput } from "../types/notifications";
import { apiRequest, apiResource, revisionHeaders } from "./api";

export function getAdminNotification(): Promise<AdminNotification | null> {
  return apiRequest<AdminNotification | null>("/api/admin/notifications");
}

export function getAdminNotificationResource() {
  return apiResource<AdminNotification | null>("/api/admin/notifications");
}

export function saveAdminNotification(
  notification: NotificationInput,
  revision?: string,
): Promise<AdminNotification> {
  return apiRequest<AdminNotification>("/api/admin/notifications", {
    method: "PUT",
    headers: revisionHeaders(revision),
    body: JSON.stringify(notification),
  });
}

export function deleteAdminNotification(revision?: string): Promise<void> {
  return apiRequest<void>("/api/admin/notifications", { method: "DELETE", headers: revisionHeaders(revision) });
}
