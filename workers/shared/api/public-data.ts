import { jsonResponse, type CloudflareEnv } from "./_lib/env";
import { createFirestoreClient, type FirestoreRestClient } from "./_lib/firestore";

type PublicDataClient = Pick<FirestoreRestClient, "getDocument" | "listDocuments">;

export async function getPublicDataResponse(
  request: Request,
  env: CloudflareEnv,
  createClient: (env: CloudflareEnv) => PublicDataClient = createFirestoreClient,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/recycle-points" && pathname !== "/api/system/settings") {
    return jsonResponse(404, { message: "Route not found." });
  }
  if (request.method !== "GET") {
    return jsonResponse(405, { message: "Method not allowed." }, { Allow: "GET" });
  }

  try {
    const firestore = createClient(env);
    if (pathname === "/api/system/settings") {
      const document = await firestore.getDocument("system/settings");
      return jsonResponse(200, {
        acceptingApplications: typeof document?.data.acceptingApplications === "boolean"
          ? document.data.acceptingApplications
          : true,
      });
    }

    const documents = await firestore.listDocuments("recycle_points");
    const points = documents.map(({ id, data }) => ({
      id,
      zone: typeof data.zone === "string" ? data.zone : "",
      neighborhood: typeof data.neighborhood === "string" ? data.neighborhood : "",
      address: typeof data.address === "string" ? data.address : "",
      ...(typeof data.name === "string" ? { name: data.name } : {}),
      ...(typeof data.googleMapsUrl === "string" ? { googleMapsUrl: data.googleMapsUrl } : {}),
    }));
    return jsonResponse(200, points);
  } catch {
    console.error(JSON.stringify({ event: "public-data.request.failed", pathname }));
    return jsonResponse(503, { message: "Public data is temporarily unavailable." });
  }
}
