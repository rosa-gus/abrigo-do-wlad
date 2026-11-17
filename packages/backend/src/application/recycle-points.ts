import {
  recyclePointInputSchema,
  RECYCLE_LIST_FIELDS,
  RECYCLE_DETAIL_FIELDS,
  type RecyclePointInput,
  type RecyclePointUpdate,
} from "@abrigo/contracts/recycle-points";
import {
  RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION,
  supportsDocumentVersion,
} from "@abrigo/domain/document-schema";
import { publicationMetadata } from "@abrigo/domain/publication";
import type { RecycleRepository } from "../ports/admin";
import type { PageInput } from "../ports/documents";
import { ApplicationError, documentId, selectFields } from "./errors";
import { assertRevision } from "./revision";

export function createRecycleService(
  repository: RecycleRepository,
  now: () => Date = () => new Date(),
) {
  async function find(id: string, write = false) {
    const document = await repository.get(documentId(id));
    if (!document) throw new ApplicationError(404, "Recycle point not found.");
    if (
      write &&
      !supportsDocumentVersion(
        document.data,
        RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION,
      )
    )
      throw new ApplicationError(
        409,
        "O ponto usa uma versão de dados mais recente ou inválida. Atualize a aplicação antes de editar.",
      );
    return document;
  }
  return {
    async list(input: PageInput) {
      const page = await repository.list(input);
      return {
        items: page.items.map((document) => ({
          ...selectFields(document.data, RECYCLE_LIST_FIELDS),
          id: document.id,
          revision: document.updateTime,
        })),
        nextCursor: page.nextCursor,
      };
    },
    async detail(id: string) {
      const document = await find(id);
      return {
        ...selectFields(document.data, RECYCLE_DETAIL_FIELDS),
        id,
        revision: document.updateTime,
      };
    },
    async create(point: RecyclePointInput) {
      const result = await repository.create({
        ...point,
        schemaVersion: RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION,
        ...publicationMetadata(
          {},
          point.publicationStatus,
          now().toISOString(),
        ),
      });
      return { id: result.id };
    },
    async update(id: string, patch: RecyclePointUpdate, expected: string) {
      const document = await find(id, true);
      assertRevision(expected, document.updateTime);
      const merged = recyclePointInputSchema.parse({
        ...document.data,
        ...patch,
      });
      await repository.update(document, {
        ...merged,
        ...publicationMetadata(
          document.data,
          merged.publicationStatus,
          now().toISOString(),
        ),
      });
      return { ok: true };
    },
    async delete(id: string, expected: string) {
      const document = await find(id, true);
      assertRevision(expected, document.updateTime);
      if (!document.updateTime)
        throw new ApplicationError(409, "Document revision unavailable.");
      await repository.delete(document);
    },
  };
}
