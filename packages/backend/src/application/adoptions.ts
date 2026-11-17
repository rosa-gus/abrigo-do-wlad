import {
  ADOPTION_SUMMARY_FIELDS,
  ADOPTION_DETAIL_FIELDS,
  type AdoptionStatus,
} from "@abrigo/contracts/adoptions";
import { adoptionStatusUpdate } from "@abrigo/domain/adoptions/transitions";
import type {
  AdoptionDecryptor,
  AdoptionRepository,
  StoredAdoption,
} from "../ports/admin";
import type { PageInput, VersionedDocument } from "../ports/documents";
import {
  requireReadableAdoption,
  serializeReadableAdoptions,
} from "./adoption-access";
import { ApplicationError, selectFields, documentId } from "./errors";
import { assertRevision } from "./revision";

export function createAdoptionService(
  repository: AdoptionRepository,
  decryptor: AdoptionDecryptor,
  clock: () => Date = () => new Date(),
) {
  async function serialize(
    documents: VersionedDocument<StoredAdoption>[],
  ): Promise<Record<string, unknown>[]> {
    return serializeReadableAdoptions(
      documents,
      async (readable) => {
        const encrypted = readable.filter(
          (document) =>
            typeof document.data.sensitive === "string" &&
            typeof document.data.keyVersion === "string",
        );
        const decrypted = await decryptor.decrypt(
          encrypted.map((document) => ({
            encryptedData: document.data.sensitive as string,
            keyVersion: document.data.keyVersion as string,
          })),
        );
        const byName = new Map(
          encrypted.map((document, index) => [document.name, decrypted[index]]),
        );
        return readable.map((document) => ({
          ...selectFields(
            { ...document.data, ...byName.get(document.name) },
            ADOPTION_DETAIL_FIELDS,
          ),
          id: document.id,
          revision: document.updateTime,
        }));
      },
      clock,
    );
  }
  return {
    serialize,
    async list(input: PageInput & { status?: string | null }) {
      const page = await repository.list({ ...input, now: clock() });
      let items;
      try {
        items = await serialize(page.items);
      } catch {
        console.error(
          JSON.stringify({
            event: "admin.adoption.page-decryption.failed",
            count: page.items.length,
          }),
        );
        throw new ApplicationError(
          500,
          "Unable to read this page of adoption applications.",
        );
      }
      return {
        items: items.map((item) => selectFields(item, ADOPTION_SUMMARY_FIELDS)),
        nextCursor: page.nextCursor,
      };
    },
    async detail(id: string) {
      const document = requireReadableAdoption(
        await repository.get(documentId(id)),
        clock(),
      );
      const [result] = await serialize([document]);
      if (!result)
        throw new ApplicationError(404, "Adoption application not found.");
      return result;
    },
    async decide(id: string, status: AdoptionStatus, expected: string) {
      const document = await repository.get(documentId(id));
      if (!document)
        throw new ApplicationError(404, "Adoption application not found.");
      assertRevision(expected, document.updateTime);
      const update = adoptionStatusUpdate(document.data, status, clock());
      if (!document.updateTime)
        throw new ApplicationError(
          409,
          "A versão da solicitação não está disponível. Atualize a página.",
        );
      const saved = await repository.update(document, {
        ...update,
        expiresAt: new Date(update.expiresAt),
      });
      return { ok: true, ...update, revision: saved.updateTime };
    },
  };
}
