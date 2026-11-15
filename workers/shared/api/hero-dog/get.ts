import { createFirestoreClient } from "../_lib/firestore";
import { isPublished } from "../../publication";
import { isDogArchived } from "../dogs/archive";
import { toPublicDog } from "../dogs/feed";
import { ensureDogPublicSlug, isValidPublicDogId } from "../dogs/public-slug";
import { getKvStore } from "../_lib/kv";
import { HTTP_STATUS } from "../_lib/constants";
import { jsonResponse, type CloudflareEnv } from "../_lib/env";

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: CloudflareEnv;
}) {
  if (request.method !== "GET") {
    return jsonResponse(HTTP_STATUS.METHOD_NOT_ALLOWED, {
      message: "Method not allowed",
    });
  }

  try {
    const kvStore = getKvStore(env);
    const cached = await kvStore.get<{ id?: string }>("hero-dog");
    const document = cached?.id && isValidPublicDogId(cached.id)
      ? await createFirestoreClient(env).getDocument(`dogs/${cached.id}`)
      : null;
    const dog = document && isPublished(document.data) && !isDogArchived(document.data)
      ? toPublicDog(document) : null;

    if (dog) {
      return jsonResponse(HTTP_STATUS.OK, {
        message: "Hero dog fetched successfully.",
        data: { ...dog, publicSlug: (await ensureDogPublicSlug(env, dog)).slug },
      });
    }

    return jsonResponse(HTTP_STATUS.NOT_FOUND, {
      message: "Hero dog not found.",
    });
  } catch (err) {
    console.error("Error fetching hero dog:", err);

    return jsonResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Error fetching hero dog.",
    });
  }
}
