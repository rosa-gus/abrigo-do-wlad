import { onRequest as createAdoptionApplication } from "@abrigo/backend/adapters/adoption/create";
import { getEnvValue, type CloudflareEnv } from "@abrigo/backend/adapters/env";
import { getDogFeedResponse } from "@abrigo/backend/adapters/dogs/feed";
import { getDogProfileBySlugResponse, resolveDogProfileBySlug } from "@abrigo/backend/adapters/dogs/profile";
import { onRequest as getHeroDog } from "@abrigo/backend/adapters/hero-dog/get";
import { getPublicDataResponse } from "@abrigo/backend/adapters/public-data";
import { onRequest as sendDebugEmail } from "@abrigo/backend/http/debug-email";
export type AppEnv = CloudflareEnv & { ASSETS: Pick<Env["ASSETS"], "fetch"> };
/** Runtime integrations are bound once per request and are never stored globally. */
export function createPublicServices(env: AppEnv) {
  return {
    fetchAsset: (request: Request) => env.ASSETS.fetch(request),
    publicData: (request: Request) => getPublicDataResponse(request, env),
    heroDog: (request: Request) => getHeroDog({ request, env }),
    dogFeed: (request: Request) => getDogFeedResponse(request, env),
    dogProfile: (request: Request, slug: string) => getDogProfileBySlugResponse(request, env, slug),
    createAdoption: (request: Request) => createAdoptionApplication({ request, env }),
    resolveDogProfileBySlug: (slug: string) => resolveDogProfileBySlug(env, slug),
    debugEmail: (request: Request) => sendDebugEmail({ request, env }),
    local: getEnvValue(env, "APP_ENV") === "local",
  };
}
export type AppServices = ReturnType<typeof createPublicServices>;
