import { createPublicServices, type AppEnv } from "./composition";
import { handleApiRequest } from "./routes/api";
import { dogPageRoute, handleDogPageRequest, secureAssetResponse } from "./routes/pages";
export type { AppEnv } from "./composition";
export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const services = createPublicServices(env);
    if (pathname.startsWith("/api/")) return handleApiRequest(request, services);
    const route = dogPageRoute(pathname);
    if (route !== null) return handleDogPageRequest(request, services, route);
    return secureAssetResponse(await services.fetchAsset(request));
  },
} satisfies ExportedHandler<Env>;
