import { afterEach, describe, expect, test, vi } from "vitest";

import {
  MAX_SOURCE_DOG_IMAGE_BYTES,
  uploadImageToCloudinary,
} from "./cloudinary";

function imageFile(): File {
  return new File(["image"], "dog.jpg", { type: "image/jpeg" });
}

describe("uploadImageToCloudinary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("preserves the error message returned by Cloudinary", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(
        { error: "Invalid image file" },
        { status: 400 },
      ));

    await expect(uploadImageToCloudinary(imageFile())).rejects.toThrow(
      "Invalid image file",
    );
  });

  test("falls back to a generic message when Cloudinary returns no detail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));

    await expect(uploadImageToCloudinary(imageFile())).rejects.toThrow(
      "Erro no upload da imagem.",
    );
  });

  test("uploads through the same-origin admin API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ url: "https://res.cloudinary.com/test/image.jpg" }, { status: 201 }),
    );

    await expect(uploadImageToCloudinary(imageFile())).resolves.toBe(
      "https://res.cloudinary.com/test/image.jpg",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/media/upload");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      method: "POST",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
  });

  test("accepts originals over 5 MB for server-side optimization", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ url: "https://res.cloudinary.com/test/optimized.jpg" }, { status: 201 }),
    );
    const original = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      "large-dog.jpg",
      { type: "image/jpeg" },
    );

    await expect(uploadImageToCloudinary(original)).resolves.toContain("optimized.jpg");
  });

  test("reuses the operation key after a lost response for the same File", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(Response.json({ url: "https://res.cloudinary.com/test/recovered.jpg" }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ url: "https://res.cloudinary.com/test/another.jpg" }, { status: 201 }));
    const file = imageFile();
    await expect(uploadImageToCloudinary(file)).rejects.toThrow("response lost");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(uploadImageToCloudinary(file)).resolves.toContain("recovered.jpg");
    await uploadImageToCloudinary(imageFile());
    const keys = fetchMock.mock.calls.map(call => new Headers(call[1]?.headers).get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  test("rejects unsupported and oversized files before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const unsupported = new File(["image"], "dog.gif", { type: "image/gif" });
    const oversized = new File(
      [new Uint8Array(MAX_SOURCE_DOG_IMAGE_BYTES + 1)],
      "dog.jpg",
      { type: "image/jpeg" },
    );

    await expect(uploadImageToCloudinary(unsupported)).rejects.toThrow(
      "JPEG, PNG ou WebP",
    );
    await expect(uploadImageToCloudinary(oversized)).rejects.toThrow("20 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
