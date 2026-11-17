import { getKvStore } from "../kv";
import {
  createFirestoreClient,
  createFirestoreDocumentId,
  type FirestoreRestClient,
} from "../firestore";
import { HTTP_STATUS } from "../../http/constants";
import type { CloudflareEnv } from "../env";
import { toPublicDog } from "../dogs/feed";
import { ensureDogPublicSlug } from "../dogs/public-slug";
import { isPublished } from "@abrigo/domain/publication";
import { isDogArchived } from "@abrigo/domain/dogs/archive";

const DOGS_COLLECTION = "dogs";

type HeroDog = {
  id: string;
  archivedAt?: unknown;
  publicationStatus?: unknown;
  [key: string]: unknown;
};

async function getRandomDogFromServer(
  firestore: FirestoreRestClient,
  env?: CloudflareEnv,
): Promise<HeroDog | null> {
  const randomKey = createFirestoreDocumentId();
  const documents = await firestore.listDocuments<HeroDog>(DOGS_COLLECTION);
  const available = documents.filter((document) => isPublished(document.data) && !isDogArchived(document.data));
  const selected = available.find((document) => document.id >= randomKey) ?? available[0];

  if (!selected) return null;
  const dog = toPublicDog(selected);
  if (!dog) return null;
  const { slug } = await ensureDogPublicSlug(env ?? {}, dog);
  return { ...dog, publicSlug: slug };
}

export async function updateHeroDog(env?: CloudflareEnv) {
  try {
    const kvStore = getKvStore(env);
    const firestore = createFirestoreClient(env);
    const currentDog = await kvStore.get<HeroDog | null>("hero-dog");
    let newDog: HeroDog | null = null;
    let attempts = 0;

    do {
      newDog = await getRandomDogFromServer(firestore, env);
      attempts++;
    } while (newDog && currentDog && newDog.id === currentDog.id && attempts < 3);

    if (newDog) {
      await kvStore.set("hero-dog", newDog);
      return {
        status: HTTP_STATUS.OK,
        body: {
          message: "Hero dog updated!",
          data: { dog: newDog },
        },
      };
    }

    await kvStore.delete("hero-dog");

    return {
      status: HTTP_STATUS.OK,
      body: {
        message: "No dog available for the highlight",
      },
    };
  } catch (err) {
    console.error("Error updating hero dog:", err);
    return {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      body: {
        message: "Error updating hero dog",
      },
    };
  }
}
