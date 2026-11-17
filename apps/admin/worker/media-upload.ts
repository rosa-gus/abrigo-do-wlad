import { createFirestoreClient, type FirestoreRestClient } from "../../../workers/shared/api/_lib/firestore";
import {
  CloudinaryUploadError, parseImageUpload, reconcileCloudinaryImage,
  uploadValidatedCloudinaryImage, type UploadedDogImage,
} from "./cloudinary";

export interface MediaUploadContext {
  actorSubject: string;
  actorRole: "administrator" | "developer";
  requestId: string;
}

type Repository = Pick<FirestoreRestClient, "getDocument" | "commitAtomic">;
type UploadCommand = Record<string, unknown> & {
  hash: string;
  publicId: string;
  state: "uploading" | "completed";
  result?: UploadedDogImage;
};

async function digest(bytes: BufferSource): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A lost response never starts another upload. The command is persisted before
 * contacting Cloudinary; retries inspect exactly the last attempted public ID.
 * A missing/invalid resource remains pending for operational reconciliation.
 */
export async function uploadManagedMedia(
  request: Request,
  env: Env,
  context?: MediaUploadContext,
  fetcher: typeof fetch = fetch,
  repository: Repository = createFirestoreClient(env),
): Promise<UploadedDogImage> {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[a-f0-9-]{36}$/i.test(key)) {
    throw new CloudinaryUploadError(428, "Envie a identidade da operação de upload.");
  }
  const { file } = await parseImageUpload(request);
  const hash = await digest(await file.arrayBuffer());
  // Bind the operation to the original payload without storing file contents.
  const path = `media_upload_commands/${await digest(new TextEncoder().encode(key))}`;
  const existing = await repository.getDocument<UploadCommand>(path);
  if (existing) {
    if (context && existing.data.actorSubject !== context.actorSubject) throw new CloudinaryUploadError(409, "A operação de upload pertence a outra identidade.");
    if (existing.data.hash !== hash) throw new CloudinaryUploadError(409, "A identidade do upload já foi usada com outra imagem.");
    if (existing.data.state === "completed" && existing.data.result) return existing.data.result;
    const result = await reconcileCloudinaryImage(existing.data.publicId, env, fetcher);
    if (!result) throw new CloudinaryUploadError(503, "Upload pendente de reconciliação. Preserve a operação e tente consultar novamente.");
    await repository.commitAtomic([{ kind: "update", path, updateTime: existing.updateTime!, data: { state: "completed", result } }]);
    return result;
  }
  const publicId = crypto.randomUUID();
  await repository.commitAtomic([{ kind: "create", path, data: {
    ...context, hash, publicId: `abrigo-do-wlad/dogs/${publicId}`, state: "uploading", createdAt: new Date().toISOString(),
  } }]);
  const result = await uploadValidatedCloudinaryImage(file, env, fetcher, {
    publicId,
    async beforeAttempt(attemptPublicId) {
      const current = await repository.getDocument<UploadCommand>(path);
      if (!current?.updateTime) throw new CloudinaryUploadError(503, "Comando de upload indisponível.");
      await repository.commitAtomic([{ kind: "update", path, updateTime: current.updateTime, data: { publicId: attemptPublicId } }]);
    },
  });
  const current = await repository.getDocument<UploadCommand>(path);
  if (!current?.updateTime) throw new CloudinaryUploadError(503, "Comando de upload indisponível.");
  await repository.commitAtomic([{ kind: "update", path, updateTime: current.updateTime, data: { state: "completed", result } }]);
  return result;
}
