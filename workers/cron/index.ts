import type { CloudflareEnv } from "@abrigo/backend/adapters/env";
import { runCronJobs } from "./jobs/run";
export { runCronJobs } from "./jobs/run";
export type { CronDependencies } from "./composition";
export default {
  async scheduled(controller, env): Promise<void> { await runCronJobs(controller, env); },
} satisfies ExportedHandler<CloudflareEnv>;
