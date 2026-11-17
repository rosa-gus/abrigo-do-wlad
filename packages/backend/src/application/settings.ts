import type { SystemSettings } from "@abrigo/contracts/system-settings";
import type { SettingsRepository } from "../ports/admin";
import { ApplicationError } from "./errors";
import { ABSENT_REVISION, assertRevision } from "./revision";

export function createSettingsService(repository: SettingsRepository) {
  return {
    async get() {
      const document = await repository.get();
      if (!document || document.data.acceptingApplications === undefined)
        return {
          acceptingApplications: false,
          revision: document?.updateTime ?? ABSENT_REVISION,
        };
      if (typeof document.data.acceptingApplications !== "boolean")
        throw new ApplicationError(
          503,
          "O campo acceptingApplications de system/settings precisa ser um booleano (true ou false).",
        );
      return {
        acceptingApplications: document.data.acceptingApplications,
        revision: document.updateTime,
      };
    },
    async save(input: SystemSettings, expected: string) {
      const document = await repository.get();
      assertRevision(expected, document?.updateTime);
      const saved = await repository.save(document, input);
      return { ...input, revision: saved.updateTime };
    },
  };
}
