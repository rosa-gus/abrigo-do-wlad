const DOG_IMAGE_FOLDER = "abrigo-do-wlad/dogs";
const ALLOWED_FORMATS = "jpg,jpeg,png,webp";
const UPLOAD_PROFILES = [
  {
    maxDimension: 2_560,
    transformation: "c_limit,h_2560,w_2560/q_auto:good",
  },
  {
    maxDimension: 2_048,
    transformation: "c_limit,h_2048,w_2048/f_webp/q_auto:good",
  },
] as const;
const MAX_SOURCE_IMAGE_DIMENSION = 12_000;
const MAX_SOURCE_IMAGE_PIXELS = 64_000_000;
const MAX_INSPECTION_BYTES = 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const MAX_SOURCE_DOG_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_STORED_DOG_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOG_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedImageMimeType = typeof ALLOWED_DOG_IMAGE_MIME_TYPES[number];

export interface UploadedDogImage {
  bytes: number;
  format: "jpg" | "jpeg" | "png" | "webp";
  height: number;
  publicId: string;
  url: string;
  width: number;
}

interface ImageMetadata {
  height: number;
  mimeType: AllowedImageMimeType;
  width: number;
}

interface CloudinaryUploadResponse {
  bytes?: unknown;
  error?: { message?: unknown };
  format?: unknown;
  height?: unknown;
  public_id?: unknown;
  resource_type?: unknown;
  secure_url?: unknown;
  width?: unknown;
}

export class CloudinaryUploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CloudinaryUploadError";
    this.status = status;
  }
}

export type CloudinaryEnv = Pick<
  Env,
  "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET" | "CLOUDINARY_CLOUD_NAME"
>;

function requireValue(env: CloudinaryEnv, key: keyof CloudinaryEnv): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is not configured.`);
  return value;
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function signParameters(
  parameters: Record<string, string | number | boolean>,
  secret: string,
): Promise<string> {
  const canonical = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return sha1Hex(`${canonical}${secret}`);
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 256;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) +
    (bytes[offset + 1] ?? 0) * 256 +
    (bytes[offset + 2] ?? 0) * 65_536
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function jpegDimensions(bytes: Uint8Array): ImageMetadata | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        mimeType: "image/jpeg",
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }

  return null;
}

function pngDimensions(bytes: Uint8Array): ImageMetadata | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    ascii(bytes, 12, 16) !== "IHDR"
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    height: view.getUint32(20),
    mimeType: "image/png",
    width: view.getUint32(16),
  };
}

function webpDimensions(bytes: Uint8Array): ImageMetadata | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = ascii(bytes, 12, 16);
  if (chunkType === "VP8X") {
    return {
      height: readUint24LittleEndian(bytes, 27) + 1,
      mimeType: "image/webp",
      width: readUint24LittleEndian(bytes, 24) + 1,
    };
  }
  if (chunkType === "VP8L" && bytes[20] === 0x2f) {
    const byte1 = bytes[21] ?? 0;
    const byte2 = bytes[22] ?? 0;
    const byte3 = bytes[23] ?? 0;
    const byte4 = bytes[24] ?? 0;
    return {
      height: 1 + (byte2 >> 6) + byte3 * 4 + (byte4 & 0x0f) * 1_024,
      mimeType: "image/webp",
      width: 1 + byte1 + (byte2 & 0x3f) * 256,
    };
  }
  if (
    chunkType === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
      mimeType: "image/webp",
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
    };
  }

  return null;
}

function inspectImage(bytes: Uint8Array): ImageMetadata | null {
  return pngDimensions(bytes) ?? webpDimensions(bytes) ?? jpegDimensions(bytes);
}

async function parseImageUpload(request: Request): Promise<{
  file: File;
  metadata: ImageMetadata;
}> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data;")) {
    throw new CloudinaryUploadError(415, "O upload deve usar multipart/form-data.");
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new CloudinaryUploadError(411, "O tamanho do upload é obrigatório.");
  }
  if (contentLength > MAX_SOURCE_DOG_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new CloudinaryUploadError(
      413,
      "A imagem original deve ter no máximo 20 MB.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new CloudinaryUploadError(400, "O corpo multipart do upload é inválido.");
  }
  const entries = [...formData.entries()];
  const file = formData.get("file");
  if (entries.length !== 1 || !(file instanceof File)) {
    throw new CloudinaryUploadError(400, "Envie exatamente um arquivo no campo file.");
  }
  if (file.size < 1 || file.size > MAX_SOURCE_DOG_IMAGE_BYTES) {
    throw new CloudinaryUploadError(
      413,
      "A imagem original deve ter no máximo 20 MB.",
    );
  }
  if (file.name.length > 180) {
    throw new CloudinaryUploadError(400, "O nome do arquivo é muito longo.");
  }
  if (!(ALLOWED_DOG_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new CloudinaryUploadError(415, "Use uma imagem JPEG, PNG ou WebP.");
  }

  const bytes = new Uint8Array(
    await file.slice(0, MAX_INSPECTION_BYTES).arrayBuffer(),
  );
  const metadata = inspectImage(bytes);
  if (!metadata || metadata.mimeType !== file.type) {
    throw new CloudinaryUploadError(415, "O conteúdo do arquivo não corresponde a uma imagem permitida.");
  }
  if (
    metadata.width < 1 ||
    metadata.height < 1 ||
    metadata.width > MAX_SOURCE_IMAGE_DIMENSION ||
    metadata.height > MAX_SOURCE_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_SOURCE_IMAGE_PIXELS
  ) {
    throw new CloudinaryUploadError(
      422,
      "A imagem excede o limite de resolução de 64 megapixels.",
    );
  }

  return { file, metadata };
}

export async function uploadCloudinaryImage(
  request: Request,
  env: CloudinaryEnv,
  fetcher: typeof fetch = fetch,
): Promise<UploadedDogImage> {
  const { file } = await parseImageUpload(request);
  const cloudName = requireValue(env, "CLOUDINARY_CLOUD_NAME");
  const apiKey = requireValue(env, "CLOUDINARY_API_KEY");
  const apiSecret = requireValue(env, "CLOUDINARY_API_SECRET");

  for (const [profileIndex, profile] of UPLOAD_PROFILES.entries()) {
    const publicId = crypto.randomUUID();
    const expectedPublicId = `${DOG_IMAGE_FOLDER}/${publicId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const parameters = {
      allowed_formats: ALLOWED_FORMATS,
      folder: DOG_IMAGE_FOLDER,
      overwrite: false,
      public_id: publicId,
      timestamp,
      transformation: profile.transformation,
    };
    const signature = await signParameters(parameters, apiSecret);
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("api_key", apiKey);
    for (const [key, value] of Object.entries(parameters)) {
      body.append(key, String(value));
    }
    body.append("signature", signature);

    const response = await fetcher(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: "POST", body },
    );
    let payload: CloudinaryUploadResponse;
    try {
      payload = await response.json() as CloudinaryUploadResponse;
    } catch {
      throw new CloudinaryUploadError(
        502,
        "O serviço de imagens retornou uma resposta inválida.",
      );
    }
    const format = payload.format;
    const allowedResponseFormats = new Set(["jpg", "jpeg", "png", "webp"]);
    let returnedUrlMatches = false;
    if (typeof payload.secure_url === "string") {
      try {
        returnedUrlMatches =
          publicIdFromUrl(payload.secure_url, cloudName) === expectedPublicId;
      } catch {
        // Invalid or foreign delivery URLs are rejected below.
      }
    }

    if (
      response.ok &&
      payload.resource_type === "image" &&
      payload.public_id === expectedPublicId &&
      typeof payload.secure_url === "string" &&
      typeof format === "string" &&
      allowedResponseFormats.has(format) &&
      typeof payload.bytes === "number" &&
      Number.isSafeInteger(payload.bytes) &&
      payload.bytes >= 1 &&
      payload.bytes <= MAX_STORED_DOG_IMAGE_BYTES &&
      typeof payload.width === "number" &&
      Number.isSafeInteger(payload.width) &&
      payload.width >= 1 &&
      payload.width <= profile.maxDimension &&
      typeof payload.height === "number" &&
      Number.isSafeInteger(payload.height) &&
      payload.height >= 1 &&
      payload.height <= profile.maxDimension &&
      returnedUrlMatches
    ) {
      return {
        bytes: payload.bytes,
        format: format as UploadedDogImage["format"],
        height: payload.height,
        publicId: expectedPublicId,
        url: payload.secure_url,
        width: payload.width,
      };
    }

    console.error(JSON.stringify({
      event: "admin.media.upload.rejected-upstream",
      profile: profileIndex + 1,
      status: response.status,
      publicId: expectedPublicId,
    }));
    if (response.ok && payload.public_id === expectedPublicId) {
      await destroyCloudinaryPublicId(expectedPublicId, env, fetcher).catch(
        (error: unknown) => {
          console.warn(JSON.stringify({
            event: "admin.media.upload.rollback.failed",
            message: error instanceof Error ? error.message : "Unknown failure",
            publicId: expectedPublicId,
          }));
        },
      );
    }

    const canRetryForSize =
      typeof payload.bytes === "number" &&
      Number.isSafeInteger(payload.bytes) &&
      payload.bytes > MAX_STORED_DOG_IMAGE_BYTES &&
      profileIndex < UPLOAD_PROFILES.length - 1;
    if (canRetryForSize) {
      console.warn(JSON.stringify({
        event: "admin.media.upload.retry-compression",
        nextProfile: profileIndex + 2,
        publicId: expectedPublicId,
      }));
      continue;
    }

    throw new CloudinaryUploadError(502, "O serviço de imagens rejeitou o upload.");
  }

  throw new CloudinaryUploadError(502, "O serviço de imagens rejeitou o upload.");
}

export function publicIdFromUrl(imageUrl: string, cloudName: string): string {
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
    throw new TypeError("Only HTTPS Cloudinary image URLs can be deleted.");
  }

  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments[0] !== cloudName || segments[1] !== "image" || segments[2] !== "upload") {
    throw new TypeError("Cloudinary image URL does not belong to this account.");
  }

  const versionIndex = segments.findIndex(
    (segment, index) => index >= 3 && /^v\d+$/.test(segment),
  );
  const publicSegments = segments.slice(versionIndex >= 0 ? versionIndex + 1 : 3);
  if (versionIndex < 0) {
    // Versionless delivery URLs may also contain transformation components.
    while (publicSegments.length > 0 && /^[a-z][a-z0-9]*_/i.test(publicSegments[0])) {
      publicSegments.shift();
    }
  }
  if (publicSegments.length === 0) throw new TypeError("Invalid Cloudinary image URL.");

  const last = publicSegments.at(-1)!;
  publicSegments[publicSegments.length - 1] = last.replace(/\.[A-Za-z0-9]+$/, "");
  const publicId = publicSegments.join("/");
  if (!publicId.startsWith(`${DOG_IMAGE_FOLDER}/`)) {
    throw new TypeError("Cloudinary image is outside the managed dog folder.");
  }
  return publicId;
}

async function destroyCloudinaryPublicId(
  publicId: string,
  env: CloudinaryEnv,
  fetcher: typeof fetch,
): Promise<void> {
  if (!publicId.startsWith(`${DOG_IMAGE_FOLDER}/`)) {
    throw new TypeError("Cloudinary image is outside the managed dog folder.");
  }
  const cloudName = requireValue(env, "CLOUDINARY_CLOUD_NAME");
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = { invalidate: true, public_id: publicId, timestamp };
  const signature = await signParameters(
    parameters,
    requireValue(env, "CLOUDINARY_API_SECRET"),
  );
  const body = new URLSearchParams({
    api_key: requireValue(env, "CLOUDINARY_API_KEY"),
    invalidate: "true",
    public_id: publicId,
    signature,
    timestamp: String(timestamp),
  });
  const response = await fetcher(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    { method: "POST", body },
  );
  const payload = (await response.json()) as { result?: string };

  if (!response.ok || !["ok", "not found"].includes(payload.result ?? "")) {
    throw new Error("Cloudinary image deletion failed.");
  }
}

export async function deleteCloudinaryImage(
  imageUrl: string,
  env: CloudinaryEnv,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const cloudName = requireValue(env, "CLOUDINARY_CLOUD_NAME");
  const publicId = publicIdFromUrl(imageUrl, cloudName);
  await destroyCloudinaryPublicId(publicId, env, fetcher);
}
