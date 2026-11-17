import { cleanupExpiredAdoptionApplications } from "@abrigo/backend/adapters/adoption/cleanup";
import { processDogPublicationOutbox } from "@abrigo/backend/adapters/dogs/publication-outbox";
import { updateDogFeed } from "@abrigo/backend/adapters/dogs/feed";
import { purgeArchivedDogs } from "@abrigo/backend/adapters/dogs/purge";
import { updateHeroDog } from "@abrigo/backend/adapters/hero-dog/update";
export interface CronDependencies {
  processDogPublicationOutbox?: typeof processDogPublicationOutbox;
  cleanupExpiredAdoptionApplications: typeof cleanupExpiredAdoptionApplications;
  purgeArchivedDogs: typeof purgeArchivedDogs;
  updateDogFeed: typeof updateDogFeed;
  updateHeroDog: typeof updateHeroDog;
}
export const productionDependencies: CronDependencies = { processDogPublicationOutbox, cleanupExpiredAdoptionApplications, purgeArchivedDogs, updateDogFeed, updateHeroDog };
