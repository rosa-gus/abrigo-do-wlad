import type { AdminRole } from "@abrigo/contracts/admin";

/** Server-side capabilities. Route metadata and defensive service checks share this policy. */
const CAPABILITY_ROLES = {
  "session.read": ["administrator", "developer"],
  "content.read": ["administrator", "developer"],
  "content.manage": ["administrator", "developer"],
  "adoptions.read": ["administrator", "developer"],
  "adoptions.decide": ["administrator", "developer"],
  "availability.manage": ["administrator", "developer"],
  "media.manage": ["administrator", "developer"],
  "notifications.read": ["administrator", "developer"],
  "notifications.manage": ["developer"],
  "keys.manage": ["developer"],
  "audit.read": ["developer"],
  "migrations.manage": ["developer"],
  "identity.inspect": ["developer"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminCapability = keyof typeof CAPABILITY_ROLES;

export function hasAdminCapability(role: AdminRole, capability: AdminCapability): boolean {
  const allowed: readonly AdminRole[] = CAPABILITY_ROLES[capability];
  return allowed.includes(role);
}
