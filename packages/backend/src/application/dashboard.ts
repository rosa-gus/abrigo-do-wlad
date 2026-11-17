import type { AdminNotification } from "@abrigo/contracts/notifications";
import type { DashboardReader } from "../ports/admin";
import type { createAdoptionService } from "./adoptions";

export function createDashboardService(
  reader: DashboardReader,
  adoptions: Pick<ReturnType<typeof createAdoptionService>, "serialize">,
  getNotification: () => Promise<AdminNotification | null>,
  now: () => Date = () => new Date(),
) {
  return {
    async get() {
      const at = now();
      const [snapshot, notification] = await Promise.all([
        reader.read(at, new Date(at.getTime() + 5 * 86_400_000)),
        getNotification(),
      ]);
      const expiring = await adoptions.serialize(snapshot.expiringDocuments);
      const expiringAdoptions = expiring
        .flatMap((adoption) => {
          if (typeof adoption.expiresAt !== "string") return [];
          const expiresAt = Date.parse(adoption.expiresAt);
          if (!Number.isFinite(expiresAt)) return [];
          return [
            {
              id: String(adoption.id),
              nome:
                typeof adoption.nome_adotante === "string"
                  ? adoption.nome_adotante
                  : "Candidato",
              daysLeft: Math.max(
                0,
                Math.ceil((expiresAt - at.getTime()) / 86_400_000),
              ),
            },
          ];
        })
        .sort((left, right) => left.daysLeft - right.daysLeft);
      return {
        metrics: {
          dogs: Math.max(0, snapshot.dogTotal - snapshot.archivedDogs),
          recycles: snapshot.recycles,
          publishedDogs: Math.max(
            0,
            snapshot.publishedDogTotal - snapshot.archivedPublishedDogs,
          ),
          publishedRecycles: snapshot.publishedRecycles,
          adoptions: snapshot.adoptions,
          adoptionsViaSite:
            typeof snapshot.statistics?.data.adoptionsCount === "number"
              ? snapshot.statistics.data.adoptionsCount
              : 0,
        },
        expiringAdoptions,
        notification,
      };
    },
  };
}
