import { adminFetch, apiRequest } from "./api";

interface AdminUploadResponse {
  url?: unknown;
}

export const MAX_SOURCE_DOG_IMAGE_BYTES = 20 * 1024 * 1024;
export const DOG_IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const uploadKeys = new WeakMap<File, string>();

const ALLOWED_IMAGE_TYPES = new Set(Object.keys(DOG_IMAGE_ACCEPT));

export async function uploadImageToCloudinary(file: File): Promise<string> {
  if (file.size < 1 || file.size > MAX_SOURCE_DOG_IMAGE_BYTES) {
    throw new Error("A imagem original deve ter no máximo 20 MB.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use uma imagem JPEG, PNG ou WebP.");
  }

  let operationKey = uploadKeys.get(file);
  if (!operationKey) {
    operationKey = crypto.randomUUID();
    uploadKeys.set(file, operationKey);
  }
  const formData = new FormData();
  formData.append("file", file);
  const response = await adminFetch("/api/admin/media/upload", {
    method: "POST",
    headers: { "Idempotency-Key": operationKey },
    body: formData,
    credentials: "same-origin",
  });
  let payload: AdminUploadResponse & { error?: unknown };
  try {
    payload = (await response.json()) as AdminUploadResponse & { error?: unknown };
  } catch {
    throw new Error(`Erro no upload da imagem (HTTP ${response.status}).`);
  }
  if (!response.ok || typeof payload.url !== "string") {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : "Erro no upload da imagem.",
    );
  }
  return payload.url;
}

export async function deleteUploadedCloudinaryImage(imageUrl: string): Promise<void> {
  await apiRequest("/api/admin/media/delete", {
    method: "POST",
    body: JSON.stringify({ imageUrl }),
  });
}
