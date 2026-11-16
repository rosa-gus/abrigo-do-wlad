import { z } from "zod";
import {
  createFirestoreClient,
  FirestoreRestError,
  type AtomicDocumentWrite,
  type FirestoreDocument,
  type FirestoreRestClient,
} from "../../../workers/shared/api/_lib/firestore";
import { DOG_DOCUMENT_SCHEMA_VERSION, supportsDocumentVersion } from "../../../workers/shared/document-schema";
import { deleteCloudinaryImage, publicIdFromUrl, type UploadedDogImage } from "./cloudinary";

const assetSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
  state: z.enum(["ready", "deleting", "deleted"]),
  referencedBy: z.array(z.string()),
});
type MediaAsset = z.infer<typeof assetSchema>;
type AssetDocument = FirestoreDocument<MediaAsset>;
export type MediaRepository = Pick<FirestoreRestClient,
  "getDocument" | "listDocuments" | "createDocument" | "updateDocument"
  | "deleteDocumentsIfUnchanged" | "commitAtomic">;

export class MediaAssetError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "MediaAssetError";
  }
}

export type DogMediaMutation =
  | { kind: "create"; id: string; data: Record<string, unknown> }
  | { kind: "update"; document: FirestoreDocument<Record<string, unknown>>; data: Record<string, unknown> }
  | { kind: "delete"; document: FirestoreDocument<Record<string, unknown>> };

function photos(data: Record<string, unknown>): string[] {
  return [data.fotos, data.retainedPhotos].flatMap(value =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

function managedPhotos(data: Record<string, unknown>, cloudName: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  const urls = photos(data);
  if (urls.length && !cloudName) throw new MediaAssetError(503, "Image service is not configured.");
  for (const url of urls) {
    try { result.set(publicIdFromUrl(url, cloudName ?? ""), url); }
    catch { /* External/legacy images remain usable and are never deleted here. */ }
  }
  return result;
}

export async function mediaAssetPath(publicId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicId));
  return `media_assets/${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function checkedAsset(document: FirestoreDocument<Record<string, unknown>> | null, publicId: string): AssetDocument | null {
  if (!document) return null;
  const parsed = assetSchema.safeParse(document.data);
  if (!parsed.success || parsed.data.publicId !== publicId || !document.updateTime) {
    throw new MediaAssetError(409, "Image registry needs reconciliation.");
  }
  return { ...document, data: parsed.data };
}

function version(document: FirestoreDocument<Record<string, unknown>>): string {
  if (!document.updateTime) throw new MediaAssetError(409, "Document version unavailable.");
  return document.updateTime;
}

function conflict(error: unknown): boolean {
  if (!(error instanceof FirestoreRestError)) return false;
  const details = error.details;
  const status = typeof details === "object" && details !== null && "error" in details
    && typeof details.error === "object" && details.error !== null && "status" in details.error
    ? details.error.status : undefined;
  return [409, 412].includes(error.status) || status === "FAILED_PRECONDITION" || status === "ABORTED";
}

/** Dog and all its managed references are changed by one version-guarded commit. */
export async function commitDogMediaMutation(
  env: Env,
  mutation: DogMediaMutation,
  repository: MediaRepository = createFirestoreClient(env),
): Promise<{ updateTime?: string }> {
  const id = mutation.kind === "create" ? mutation.id : mutation.document.id;
  const path = `dogs/${id}`;
  const before = mutation.kind === "create" ? {} : mutation.document.data;
  const after = mutation.kind === "delete" ? {} : { ...before, ...mutation.data };
  const beforeAssets = managedPhotos(before, env.CLOUDINARY_CLOUD_NAME);
  const afterAssets = managedPhotos(after, env.CLOUDINARY_CLOUD_NAME);
  const affected = new Map([...beforeAssets, ...afterAssets]);
  // External URLs do not participate in Cloudinary deletion and need no registry.
  if (affected.size === 0) {
    if (mutation.kind === "create") {
      return repository.createDocument("dogs", mutation.data, { documentId: id });
    } else if (mutation.kind === "update") {
      return repository.updateDocument(mutation.document.name, mutation.data, { expectedUpdateTime: version(mutation.document) });
    } else {
      await repository.deleteDocumentsIfUnchanged([{ name: mutation.document.name, updateTime: version(mutation.document) }]);
    }
    return {};
  }
  const writes: AtomicDocumentWrite[] = [mutation.kind === "create"
    ? { kind: "create", path, data: mutation.data }
    : mutation.kind === "update"
      ? { kind: "update", path, data: mutation.data, updateTime: version(mutation.document) }
      : { kind: "delete", path, updateTime: version(mutation.document) }];
  for (const [publicId, url] of affected) {
    const assetPath = await mediaAssetPath(publicId);
    const asset = checkedAsset(await repository.getDocument(assetPath), publicId);
    if (afterAssets.has(publicId) && asset && asset.data.state !== "ready") {
      throw new MediaAssetError(409, "Image is being deleted or has already been deleted.");
    }
    const refs = new Set(asset?.data.referencedBy ?? []);
    refs.delete(path);
    if (afterAssets.has(publicId)) refs.add(path);
    const data: MediaAsset = {
      publicId, url: asset?.data.url ?? url,
      state: asset?.data.state ?? "ready", referencedBy: [...refs].sort(),
    };
    writes.push(asset
      ? { kind: "update", path: assetPath, data, updateTime: version(asset) }
      : { kind: "create", path: assetPath, data });
  }
  try {
    const result = await repository.commitAtomic(writes);
    return { updateTime: result.writeResults?.[0]?.updateTime };
  }
  catch (error) {
    if (conflict(error)) throw new MediaAssetError(mutation.kind === "create" ? 409 : 412, "Dog or image changed; reload before saving.");
    throw error;
  }
}

export async function registerUploadedMedia(
  env: Env,
  upload: UploadedDogImage,
  repository: MediaRepository = createFirestoreClient(env),
): Promise<void> {
  const publicId = publicIdFromUrl(upload.url, env.CLOUDINARY_CLOUD_NAME ?? "");
  if (publicId !== upload.publicId) throw new MediaAssetError(502, "Invalid uploaded image identity.");
  const path = await mediaAssetPath(publicId);
  const existing = checkedAsset(await repository.getDocument(path), publicId);
  if (existing) {
    if (existing.data.state !== "ready") throw new MediaAssetError(409, "Uploaded image is not available.");
    return;
  }
  await repository.commitAtomic([{ kind: "create", path, data: {
    publicId, url: upload.url, state: "ready", referencedBy: [],
  } }]);
}

/**
 * Inventory every legacy reference before enforcing a tombstone. Every new
 * binding must update the same asset revision, making the scan/CAS race safe.
 * A failed destroy deliberately leaves `deleting`; retries resume safely.
 */
export async function deleteManagedMedia(
  env: Env,
  imageUrl: string,
  repository: MediaRepository = createFirestoreClient(env),
  destroy: typeof deleteCloudinaryImage = deleteCloudinaryImage,
): Promise<void> {
  let publicId: string;
  try { publicId = publicIdFromUrl(imageUrl, env.CLOUDINARY_CLOUD_NAME ?? ""); }
  catch { throw new MediaAssetError(400, "Invalid managed image URL."); }
  const path = await mediaAssetPath(publicId);
  let asset = checkedAsset(await repository.getDocument(path), publicId);
  if (!asset) {
    try {
      await repository.commitAtomic([{ kind: "create", path, data: {
        publicId, url: imageUrl, state: "ready", referencedBy: [],
      } }]);
    } catch (error) { if (!conflict(error)) throw error; }
    asset = checkedAsset(await repository.getDocument(path), publicId);
  }
  if (!asset) throw new MediaAssetError(503, "Image registry is unavailable.");
  if (asset.data.state === "deleted") return;
  if (asset.data.state === "ready") {
    // Read the registry revision BEFORE the inventory. A concurrent link either
    // changes this version (rejecting this commit) or observes `deleting`.
    const dogs = await repository.listDocuments<Record<string, unknown>>("dogs");
    if (dogs.some(({ data }) => !supportsDocumentVersion(data, DOG_DOCUMENT_SCHEMA_VERSION))) {
      throw new MediaAssetError(409, "Update the application before deleting images referenced by unsupported dog schemas.");
    }
    if (dogs.some(({ data }) => managedPhotos(data, env.CLOUDINARY_CLOUD_NAME).has(publicId))) {
      throw new MediaAssetError(409, "Image is linked to a dog.");
    }
    try {
      await repository.commitAtomic([{ kind: "update", path, updateTime: version(asset), data: {
        state: "deleting", referencedBy: [],
      } }]);
    } catch (error) {
      if (conflict(error)) throw new MediaAssetError(409, "Image references changed; reload before deleting.");
      throw error;
    }
  }
  await destroy(imageUrl, env);
  const current = checkedAsset(await repository.getDocument(path), publicId);
  if (!current) throw new MediaAssetError(503, "Image registry is unavailable.");
  if (current.data.state === "deleted") return;
  try {
    await repository.commitAtomic([{ kind: "update", path, updateTime: version(current), data: {
      state: "deleted", referencedBy: [],
    } }]);
  } catch (error) {
    if (conflict(error)) {
      const latest = checkedAsset(await repository.getDocument(path), publicId);
      if (latest?.data.state === "deleted") return;
    }
    throw error;
  }
}
