export type NotificationType = "trivial" | "urgent" | "success" | "info";
export type NotificationExpiration = "1h" | "6h" | "12h" | "until_deleted";

export interface AdminNotification {
  revision?: string;
  message: string;
  type: NotificationType;
  target: "admin";
  updatedAt: string;
  author: string;
  expiration: NotificationExpiration;
  expiresAt: string | null;
}

export interface NotificationInput {
  message: string;
  type: NotificationType;
  expiration: NotificationExpiration;
}
