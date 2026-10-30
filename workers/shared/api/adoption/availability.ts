import { createFirestoreClient } from "../_lib/firestore";
import type { CloudflareEnv } from "../_lib/env";

export async function isAcceptingApplications(env: CloudflareEnv): Promise<boolean> {
  const settings = await createFirestoreClient(env).getDocument("system/settings");
  const acceptingApplications = settings?.data.acceptingApplications;
  if (typeof acceptingApplications !== "boolean") {
    throw new Error("Adoption availability is not configured.");
  }
  return acceptingApplications;
}
