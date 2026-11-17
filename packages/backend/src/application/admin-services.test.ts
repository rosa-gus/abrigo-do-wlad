import { expect, test, vi } from "vitest";
import { createDogService } from "./dogs";
import { createAdoptionService } from "./adoptions";
import type { DogProjection, DogRepository, AdoptionRepository } from "../ports/admin";
import type { VersionedDocument } from "../ports/documents";

const revision = "2026-11-17T10:00:00.123456789Z";
const now = new Date("2026-11-17T12:00:00Z");
function dogRepository(document: VersionedDocument): DogRepository {
  return {
    list: vi.fn().mockResolvedValue({ items: [document], nextCursor: null }),
    find: vi.fn().mockResolvedValue(document), commit: vi.fn().mockResolvedValue({ updateTime: revision }),
    archive: vi.fn().mockResolvedValue(undefined), restore: vi.fn().mockResolvedValue(undefined),
    inventory: vi.fn().mockResolvedValue([document]),
  };
}
function projection(): DogProjection {
  return { refreshFeed: vi.fn(), refreshHero: vi.fn(), saveTombstone: vi.fn().mockResolvedValue(undefined), deleteTombstone: vi.fn().mockResolvedValue(undefined) };
}
function dog(data: Record<string, unknown> = {}): VersionedDocument {
  return { id: "dog1", name: "dogs/dog1", updateTime: revision, data: { nome: "Luna", publicationStatus: "draft", ...data } };
}

test("dog detail explicitly selects its administrative DTO and hides future persistence fields", async () => {
  const service = createDogService(dogRepository(dog({ privateMaintenanceToken: "hidden", publicSlug: "luna" })), projection(), () => "unused");
  expect(await service.detail("doc:dog1")).toEqual({ nome: "Luna", publicationStatus: "draft", publicSlug: "luna", documentId: "dog1", revision });
});

test("an obsolete observed revision never reaches the dog write port", async () => {
  const repository = dogRepository(dog());
  const service = createDogService(repository, projection(), () => "unused");
  await expect(service.update("doc:dog1", { nome: "Changed" }, "older-revision")).rejects.toMatchObject({ status: 412 });
  expect(repository.commit).not.toHaveBeenCalled();
});

test("archiving an adoption uses one atomic counter port and does not repeat it for an already archived record", async () => {
  const repository = dogRepository(dog());
  const service = createDogService(repository, projection(), () => "unused", () => now);
  const result = await service.archive("doc:dog1", "adopted_via_site", "admin@example.test", revision);
  expect(repository.archive).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ updateTime: revision }), expect.objectContaining({ archiveReason: "adopted_via_site", adoptionCountedAt: now.toISOString() }), true);
  vi.mocked(repository.find).mockResolvedValue(dog({ archiveReason: "adopted_via_site", archivedAt: result.archivedAt, purgeAfter: result.purgeAfter, adoptionCountedAt: result.archivedAt }));
  await service.archive("doc:dog1", "adopted_via_site", "admin@example.test", revision);
  expect(repository.archive).toHaveBeenCalledTimes(1);
});

test("an expired application is unavailable without invoking the decryption port", async () => {
  const repository: AdoptionRepository = {
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    get: vi.fn().mockResolvedValue({ id: "app1", name: "adoption_application/app1", updateTime: revision,
      data: { sensitive: "ciphertext", keyVersion: "v1", expiresAt: now.toISOString() } }),
    update: vi.fn().mockResolvedValue({ updateTime: revision }),
  };
  const decrypt = vi.fn().mockResolvedValue([{ nome_adotante: "never exposed" }]);
  const service = createAdoptionService(repository, { decrypt }, () => now);
  await expect(service.detail("app1")).rejects.toThrow("Adoption application not found.");
  expect(decrypt).not.toHaveBeenCalled();
});

test("adoption detail keeps only contracted plaintext and excludes operational metadata", async () => {
  const repository: AdoptionRepository = {
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    get: vi.fn().mockResolvedValue({ id: "app1", name: "adoption_application/app1", updateTime: revision,
      data: { sensitive: "ciphertext", keyVersion: "v1", requestFingerprint: "hidden", notificationAttemptId: "hidden", expiresAt: "2026-11-18T12:00:00Z", status: "pending" } }),
    update: vi.fn().mockResolvedValue({ updateTime: revision }),
  };
  const service = createAdoptionService(repository, { decrypt: async () => [{ nome_adotante: "Synthetic", extraSecret: "hidden" }] }, () => now);
  expect(await service.detail("app1")).toEqual({ id: "app1", revision, nome_adotante: "Synthetic", expiresAt: "2026-11-18T12:00:00Z", status: "pending" });
});
