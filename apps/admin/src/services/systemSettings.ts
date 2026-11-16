import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { apiRequest, revisionHeaders } from "./api";

export async function getSystemSettings(): Promise<SystemSettings & { revision?: string }> {
  const result = await apiRequest<SystemSettings & { revision?: string }>("/api/admin/system/settings");
  return { ...systemSettingsSchema.parse({ acceptingApplications: result.acceptingApplications }), revision: result.revision };
}

export async function updateSystemSettings(acceptingApplications: boolean, revision?: string): Promise<SystemSettings & { revision?: string }> {
  const result = await apiRequest<SystemSettings & { revision?: string }>("/api/admin/system/settings", {
    method: "PATCH",
    headers: revisionHeaders(revision),
    body: JSON.stringify({ acceptingApplications }),
  });
  return { ...systemSettingsSchema.parse({ acceptingApplications: result.acceptingApplications }), revision: result.revision };
}
