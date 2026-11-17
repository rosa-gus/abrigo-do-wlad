import {
  dogInputSchema,
  DOG_LIST_FIELDS,
  DOG_DETAIL_FIELDS,
  type DogInput,
  type DogUpdate,
} from "@abrigo/contracts/dogs";
import {
  DOG_DOCUMENT_SCHEMA_VERSION,
  supportsDocumentVersion,
} from "@abrigo/domain/document-schema";
import { isPublished, publicationMetadata } from "@abrigo/domain/publication";
import {
  dogArchiveDates,
  isDogArchived,
  type DogArchiveReason,
} from "@abrigo/domain/dogs/archive";
import type { DogProjection, DogRepository } from "../ports/admin";
import type { PageInput, VersionedDocument } from "../ports/documents";
import { ApplicationError, selectFields } from "./errors";
import { assertRevision } from "./revision";
import { inventoryLegacyDogIds } from "./dog-identity";

export function createDogService(
  repository: DogRepository,
  projection: DogProjection,
  createId: () => string,
  now: () => Date = () => new Date(),
) {
  async function find(
    routeId: string,
    write = false,
  ): Promise<VersionedDocument> {
    const document = await repository.find(routeId);
    if (!document) throw new ApplicationError(404, "Dog not found.");
    if (
      write &&
      !supportsDocumentVersion(document.data, DOG_DOCUMENT_SCHEMA_VERSION)
    ) {
      throw new ApplicationError(
        409,
        "A ficha usa uma versão de dados mais recente ou inválida. Atualize a aplicação antes de editar.",
      );
    }
    return document;
  }
  async function tryProjection(work: () => Promise<unknown>) {
    try {
      await work();
    } catch {
      console.warn(JSON.stringify({ event: "admin.dog.publication.pending" }));
    }
  }
  async function tombstone(
    document: VersionedDocument,
    reason: DogArchiveReason,
    removedAt: string,
  ) {
    if (
      isPublished(document.data) &&
      typeof document.data.publishedAt === "string"
    )
      await tryProjection(() =>
        projection.saveTombstone({
          id: document.id,
          nome:
            typeof document.data.nome === "string" && document.data.nome.trim()
              ? document.data.nome
              : "Cão",
          status: reason === "adopted_via_site" ? "adopted" : "unavailable",
          removedAt,
        }),
      );
  }
  return {
    async list(input: PageInput & { state: "active" | "archived" }) {
      const page = await repository.list(input);
      return {
        items: page.items
          .filter(
            (document) =>
              isDogArchived(document.data) === (input.state === "archived"),
          )
          .map((document) => ({
            ...selectFields(document.data, DOG_LIST_FIELDS),
            documentId: document.id,
            revision: document.updateTime,
          })),
        nextCursor: page.nextCursor,
      };
    },
    async detail(routeId: string) {
      const document = await find(routeId);
      return {
        ...selectFields(document.data, DOG_DETAIL_FIELDS),
        documentId: document.id,
        revision: document.updateTime,
      };
    },
    async create(dog: DogInput) {
      const id = createId();
      const result = await repository.commit({
        kind: "create",
        id,
        data: {
          ...dog,
          schemaVersion: DOG_DOCUMENT_SCHEMA_VERSION,
          ...publicationMetadata(
            {},
            dog.publicationStatus,
            now().toISOString(),
          ),
        },
      });
      projection.refreshFeed();
      return { id, documentId: id, revision: result.updateTime };
    },
    async update(routeId: string, patch: DogUpdate, expected: string) {
      const document = await find(routeId, true);
      if (isDogArchived(document.data))
        throw new ApplicationError(409, "Archived dogs cannot be edited.");
      assertRevision(expected, document.updateTime);
      const merged = dogInputSchema.parse({ ...document.data, ...patch });
      const update: Record<string, unknown> = {
        ...merged,
        ...publicationMetadata(
          document.data,
          merged.publicationStatus,
          now().toISOString(),
        ),
      };
      if (patch.fotos) {
        const photos = (value: unknown) =>
          Array.isArray(value)
            ? value.filter(
                (photo): photo is string => typeof photo === "string",
              )
            : [];
        update.retainedPhotos = [
          ...new Set([
            ...photos(document.data.retainedPhotos),
            ...photos(document.data.fotos).filter(
              (photo) => !patch.fotos?.includes(photo),
            ),
          ]),
        ];
      }
      const saved = await repository.commit({
        kind: "update",
        document,
        data: update,
      });
      projection.refreshFeed();
      return { ok: true, revision: saved.updateTime };
    },
    async delete(routeId: string, expected: string) {
      const document = await find(routeId, true);
      assertRevision(expected, document.updateTime);
      if (
        isDogArchived(document.data) ||
        document.data.publicationStatus !== "draft"
      )
        throw new ApplicationError(
          409,
          "Somente rascunhos não arquivados podem ser excluídos.",
        );
      if (!document.updateTime)
        throw new ApplicationError(409, "Document version unavailable.");
      await repository.commit({ kind: "delete", document });
      await tryProjection(() => projection.deleteTombstone(document.id));
      projection.refreshFeed();
      projection.refreshHero();
    },
    async archive(
      routeId: string,
      reason: DogArchiveReason,
      actorEmail: string,
      expected: string,
    ) {
      const document = await find(routeId, true);
      assertRevision(expected, document.updateTime);
      const id = document.data.id ?? document.id;
      if (isDogArchived(document.data)) {
        if (
          document.data.archiveReason !== reason ||
          typeof document.data.archivedAt !== "string"
        )
          throw new ApplicationError(409, "Dog is already archived.");
        await tombstone(document, reason, document.data.archivedAt);
        projection.refreshFeed();
        projection.refreshHero();
        return {
          id,
          archivedAt: document.data.archivedAt,
          purgeAfter: document.data.purgeAfter,
        };
      }
      const dates = dogArchiveDates(now());
      const shouldCount =
        reason === "adopted_via_site" &&
        typeof document.data.adoptionCountedAt !== "string";
      await repository.archive(
        document,
        {
          ...dates,
          purgeAfter: new Date(dates.purgeAfter),
          archiveReason: reason,
          archivedBy: actorEmail,
          ...(shouldCount ? { adoptionCountedAt: dates.archivedAt } : {}),
        },
        shouldCount,
      );
      await tombstone(document, reason, dates.archivedAt);
      projection.refreshFeed();
      projection.refreshHero();
      return { ...dates, id, archiveReason: reason, archivedBy: actorEmail };
    },
    async restore(routeId: string, expected: string) {
      const document = await find(routeId, true);
      assertRevision(expected, document.updateTime);
      if (isDogArchived(document.data))
        await repository.restore(document, {
          archivedAt: null,
          purgeAfter: null,
          archiveReason: null,
          archivedBy: null,
          publicationStatus: "draft",
          updatedAt: now().toISOString(),
        });
      await tryProjection(() => projection.deleteTombstone(document.id));
      projection.refreshFeed();
      return { ok: true };
    },
    async inventory() {
      return inventoryLegacyDogIds(await repository.inventory());
    },
  };
}
