import type { AccessIdentity } from "@abrigo/contracts/admin";
import type { AdminServices } from "../composition";
import type { AdminRouteMatch } from "./registry";
export interface AdminRouteContext {
  request: Request;
  route: AdminRouteMatch;
  identity: AccessIdentity;
  services: AdminServices;
}
