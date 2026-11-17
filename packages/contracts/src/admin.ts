export const ADMIN_ROLES = ["administrator", "developer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AccessIdentity {
  email: string;
  role: AdminRole;
  subject: string;
}

export type AdminSession = Pick<AccessIdentity, "email" | "role">;
export interface AdminPage<T> { items: T[]; nextCursor: string | null }
