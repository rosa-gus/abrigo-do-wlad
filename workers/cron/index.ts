import type { CloudflareEnv } from "../shared/api/_lib/env";
import { cleanupExpiredAdoptionApplications } from "../shared/api/adoption/cleanup";
import { updateDogFeed } from "../shared/api/dogs/feed";
import { purgeArchivedDogs } from "../shared/api/dogs/purge";
import { updateHeroDog } from "../shared/api/hero-dog/update";

export interface CronDependencies {
  cleanupExpiredAdoptionApplications: typeof cleanupExpiredAdoptionApplications;
  purgeArchivedDogs: typeof purgeArchivedDogs;
  updateDogFeed: typeof updateDogFeed;
  updateHeroDog: typeof updateHeroDog;
}

const productionDependencies: CronDependencies = {
  cleanupExpiredAdoptionApplications,
  purgeArchivedDogs,
  updateDogFeed,
  updateHeroDog,
};

export async function runCronJobs(
  controller: ScheduledController,
  env: CloudflareEnv,
  dependencies: CronDependencies = productionDependencies,
): Promise<void> {
  const scheduledAt = new Date(controller.scheduledTime);
  const configuredMode = env.ADOPTION_CLEANUP_MODE?.trim().toLowerCase();
  const cleanupMode = configuredMode === "delete" || configuredMode === "dry-run"
    ? configuredMode
    : "disabled";
  const configuredDogPurgeMode = env.DOG_PURGE_MODE?.trim().toLowerCase();
  const dogPurgeMode = configuredDogPurgeMode === "delete" || configuredDogPurgeMode === "dry-run"
    ? configuredDogPurgeMode
    : "disabled";
  console.log(
    JSON.stringify({
      event: "cron.started",
      cron: controller.cron,
      scheduledAt: scheduledAt.toISOString(),
    }),
  );

  const cleanupPromise = cleanupMode === "disabled"
    ? Promise.resolve({
        batches: 0,
        cutoff: scheduledAt.toISOString(),
        deleted: 0,
        hasMore: false,
        matched: 0,
      })
    : dependencies.cleanupExpiredAdoptionApplications(env, {
        cutoff: scheduledAt,
        dryRun: cleanupMode === "dry-run",
      });
  const dogPurgePromise = dogPurgeMode === "disabled"
    ? Promise.resolve({
        batches: 0,
        cutoff: scheduledAt.toISOString(),
        deleted: 0,
        hasMore: false,
        matched: 0,
      })
    : dependencies.purgeArchivedDogs(env, {
        cutoff: scheduledAt,
        dryRun: dogPurgeMode === "dry-run",
      });
  const results = await Promise.allSettled([
    dependencies.updateHeroDog(env),
    dependencies.updateDogFeed(env, { now: scheduledAt }),
    cleanupPromise,
    dogPurgePromise,
  ]);
  const [heroResult, dogFeedResult, cleanupResult, dogPurgeResult] = results;
  const errors: string[] = [];

  if (heroResult.status === "rejected") {
    errors.push(
      `hero-dog: ${heroResult.reason instanceof Error ? heroResult.reason.message : String(heroResult.reason)}`,
    );
  } else if (heroResult.value.status >= 400) {
    errors.push(
      `hero-dog: status ${heroResult.value.status} (${heroResult.value.body.message})`,
    );
  } else {
    console.log(JSON.stringify({ event: "cron.hero-dog.completed" }));
  }

  if (dogFeedResult.status === "rejected") {
    errors.push(
      `dogs-feed: ${dogFeedResult.reason instanceof Error ? dogFeedResult.reason.message : String(dogFeedResult.reason)}`,
    );
  } else {
    console.log(JSON.stringify({
      event: "cron.dogs-feed.completed",
      version: dogFeedResult.value.version,
      total: dogFeedResult.value.dogs.length,
    }));
  }

  if (cleanupResult.status === "rejected") {
    errors.push(
      `adoption-cleanup: ${cleanupResult.reason instanceof Error ? cleanupResult.reason.message : String(cleanupResult.reason)}`,
    );
  } else {
    console.log(
      JSON.stringify({
        event: cleanupMode === "disabled"
          ? "cron.adoption-cleanup.skipped"
          : "cron.adoption-cleanup.completed",
        mode: cleanupMode,
        ...cleanupResult.value,
      }),
    );
  }

  if (dogPurgeResult.status === "rejected") {
    errors.push(
      `dog-purge: ${dogPurgeResult.reason instanceof Error ? dogPurgeResult.reason.message : String(dogPurgeResult.reason)}`,
    );
  } else {
    console.log(JSON.stringify({
      event: dogPurgeMode === "disabled" ? "cron.dog-purge.skipped" : "cron.dog-purge.completed",
      mode: dogPurgeMode,
      ...dogPurgeResult.value,
    }));
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ event: "cron.failed", errors }));
    throw new Error(`Scheduled jobs failed: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({ event: "cron.completed" }));
}

export default {
  async scheduled(controller, env): Promise<void> {
    await runCronJobs(controller, env);
  },
} satisfies ExportedHandler<CloudflareEnv>;
