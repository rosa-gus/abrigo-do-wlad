import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { apiRequest } from "./api";

export async function getSystemSettings(): Promise<SystemSettings> {
  return systemSettingsSchema.parse(await apiRequest<unknown>("/api/admin/system/settings"));
}

export async function updateSystemSettings(acceptingApplications: boolean): Promise<SystemSettings> {
  return systemSettingsSchema.parse(await apiRequest<unknown>("/api/admin/system/settings", {
    method: "PATCH",
    body: JSON.stringify({ acceptingApplications }),
  }));
}
