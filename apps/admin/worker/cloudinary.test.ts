import assert from "node:assert/strict";
import { test, vi } from "vitest";

import {
  CloudinaryUploadError,
  deleteCloudinaryImage,
  MAX_SOURCE_DOG_IMAGE_BYTES,
  MAX_STORED_DOG_IMAGE_BYTES,
  type CloudinaryEnv,
  uploadCloudinaryImage,
} from "./cloudinary";

const env: CloudinaryEnv = {
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
};

function pngFile(width = 1_200, height = 800): File {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return new File([bytes], "dog.png", { type: "image/png" });
}

function uploadRequest(file: File, contentLength = file.size + 256): Request {
  const body = new FormData();
  body.append("file", file);
  return new Request("https://admin.example.test/api/admin/media/upload", {
    method: "POST",
    headers: { "Content-Length": String(contentLength) },
    body,
  });
}

test("server-side upload fixes format, storage and transformation controls", async () => {
  let requestUrl = "";
  let body: FormData | undefined;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    body = init?.body as FormData;
    const publicId = body.get("public_id");
    return Response.json({
      bytes: 80_000,
      format: "png",
      height: 800,
      public_id: `abrigo-do-wlad/dogs/${publicId}`,
      resource_type: "image",
      secure_url:
        `https://res.cloudinary.com/test-cloud/image/upload/v1/abrigo-do-wlad/dogs/${publicId}.png`,
      width: 1_200,
    });
  }) as typeof fetch;

  const result = await uploadCloudinaryImage(uploadRequest(pngFile()), env, fetcher);

  assert.equal(
    requestUrl,
    "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
  );
  assert.equal(body?.get("allowed_formats"), "jpg,jpeg,png,webp");
  assert.equal(body?.get("folder"), "abrigo-do-wlad/dogs");
  assert.equal(body?.get("overwrite"), "false");
  assert.equal(
    body?.get("transformation"),
    "c_limit,h_2560,w_2560/q_auto:good",
  );
  assert.match(String(body?.get("public_id")), /^[0-9a-f-]{36}$/);
  assert.match(String(body?.get("signature")), /^[a-f0-9]{40}$/);
  assert.equal(result.format, "png");
  assert.equal(result.width, 1_200);
  assert.match(result.url, /^https:\/\/res\.cloudinary\.com\/test-cloud\//);
});

test("server-side upload rejects spoofed image content before Cloudinary", async () => {
  let called = false;
  const fetcher = (async () => {
    called = true;
    return Response.json({});
  }) as typeof fetch;
  const fakeImage = new File(["not an image"], "dog.png", {
    type: "image/png",
  });

  await assert.rejects(
    () => uploadCloudinaryImage(uploadRequest(fakeImage), env, fetcher),
    (error: unknown) => {
      assert.ok(error instanceof CloudinaryUploadError);
      assert.equal(error.status, 415);
      return true;
    },
  );
  assert.equal(called, false);
});

test("server-side upload accepts originals over 5 MB for automatic optimization", async () => {
  const largePng = new File(
    [pngFile(), new Uint8Array(6 * 1024 * 1024)],
    "large-dog.png",
    { type: "image/png" },
  );
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body as FormData;
    const publicId = body.get("public_id");
    return Response.json({
      bytes: 900_000,
      format: "png",
      height: 1_707,
      public_id: `abrigo-do-wlad/dogs/${publicId}`,
      resource_type: "image",
      secure_url:
        `https://res.cloudinary.com/test-cloud/image/upload/v1/abrigo-do-wlad/dogs/${publicId}.png`,
      width: 2_560,
    });
  }) as typeof fetch;

  const result = await uploadCloudinaryImage(uploadRequest(largePng), env, fetcher);

  assert.equal(result.bytes, 900_000);
  assert.equal(result.width, 2_560);
});

test("server-side upload rejects only the source safety cap and excessive resolution", async () => {
  await assert.rejects(
    () => uploadCloudinaryImage(
      uploadRequest(pngFile(), MAX_SOURCE_DOG_IMAGE_BYTES + 64 * 1024 + 1),
      env,
    ),
    (error: unknown) => {
      assert.ok(error instanceof CloudinaryUploadError);
      assert.equal(error.status, 413);
      return true;
    },
  );

  await assert.rejects(
    () => uploadCloudinaryImage(uploadRequest(pngFile(10_000, 7_000)), env),
    (error: unknown) => {
      assert.ok(error instanceof CloudinaryUploadError);
      assert.equal(error.status, 422);
      return true;
    },
  );
});

test("server-side upload retries compression when the first result exceeds 5 MB", async () => {
  const transformations: string[] = [];
  const uploadedPublicIds: string[] = [];
  const destroyedPublicIds: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/image/upload")) {
      const body = init?.body as FormData;
      const publicId = `abrigo-do-wlad/dogs/${body.get("public_id")}`;
      uploadedPublicIds.push(publicId);
      transformations.push(String(body.get("transformation")));
      const isFallback = uploadedPublicIds.length === 2;
      return Response.json({
        bytes: isFallback ? 850_000 : MAX_STORED_DOG_IMAGE_BYTES + 1,
        format: isFallback ? "webp" : "png",
        height: isFallback ? 2_048 : 2_560,
        public_id: publicId,
        resource_type: "image",
        secure_url:
          `https://res.cloudinary.com/test-cloud/image/upload/v1/${publicId}.${isFallback ? "webp" : "png"}`,
        width: isFallback ? 2_048 : 2_560,
      });
    }
    destroyedPublicIds.push(
      String((init?.body as URLSearchParams).get("public_id")),
    );
    return Response.json({ result: "ok" });
  }) as typeof fetch;

  const result = await uploadCloudinaryImage(
    uploadRequest(pngFile()),
    env,
    fetcher,
  );

  assert.equal(result.bytes, 850_000);
  assert.equal(result.format, "webp");
  assert.deepEqual(transformations, [
    "c_limit,h_2560,w_2560/q_auto:good",
    "c_limit,h_2048,w_2048/f_webp/q_auto:good",
  ]);
  assert.deepEqual(destroyedPublicIds, [uploadedPublicIds[0]]);
});

test("image deletion accepts only this account and managed folder", async () => {
  let requestUrl = "";
  let body: URLSearchParams | undefined;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    body = init?.body as URLSearchParams;
    return Response.json({ result: "ok" });
  }) as typeof fetch;

  await deleteCloudinaryImage(
    "https://res.cloudinary.com/test-cloud/image/upload/v123/abrigo-do-wlad/dogs/wlad.jpg",
    env,
    fetcher,
  );

  assert.equal(requestUrl, "https://api.cloudinary.com/v1_1/test-cloud/image/destroy");
  assert.equal(body?.get("public_id"), "abrigo-do-wlad/dogs/wlad");
  assert.match(body?.get("signature") ?? "", /^[a-f0-9]{40}$/);

  await assert.rejects(
    () => deleteCloudinaryImage(
      "https://res.cloudinary.com/other-cloud/image/upload/v1/abrigo-do-wlad/dogs/wlad.jpg",
      env,
      fetcher,
    ),
    /does not belong/,
  );
  await assert.rejects(
    () => deleteCloudinaryImage(
      "https://res.cloudinary.com/test-cloud/image/upload/v1/unmanaged/wlad.jpg",
      env,
      fetcher,
    ),
    /outside the managed dog folder/,
  );
});

test("multipart does not trust a small declared length", async () => {
  const request = new Request("https://admin.example.test/api/admin/media/upload", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
    body: new Uint8Array(MAX_SOURCE_DOG_IMAGE_BYTES + 64 * 1024 + 1),
  });
  await assert.rejects(() => uploadCloudinaryImage(request, env), (error: unknown) => error instanceof CloudinaryUploadError && error.status === 413);
});

test("Cloudinary response-body stalls hit the same deadline without retry", async () => {
  vi.useFakeTimers();
  let calls = 0;
  let aborted = false;
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }));
  }) as typeof fetch;
  try {
    const outcome = assert.rejects(() => deleteCloudinaryImage(
      "https://res.cloudinary.com/test-cloud/image/upload/v1/abrigo-do-wlad/dogs/wlad.jpg", env, fetcher,
    ), (error: unknown) => error instanceof CloudinaryUploadError && error.status === 504);
    await vi.waitFor(() => assert.equal(calls, 1));
    await vi.advanceTimersByTimeAsync(15_001);
    await outcome;
    assert.equal(aborted, true);
    assert.equal(calls, 1);
  } finally { vi.useRealTimers(); }
});
