import { z } from "zod";

export const notificationCoreSchema = z.object({
  message: z.string().trim().min(1).max(240),
  type: z.enum(["trivial", "urgent", "success", "info"]),
});
export const notificationExpirationSchema = z.enum(["1h", "6h", "12h", "until_deleted"]);

export const notificationInputSchema = notificationCoreSchema.extend({
  expiration: notificationExpirationSchema,
});

export const adminNotificationSchema = notificationCoreSchema.extend({
  target: z.literal("admin"),
  updatedAt: z.string().datetime(),
  author: z.string().email(),
  expiration: notificationExpirationSchema,
  expiresAt: z.string().datetime().nullable(),
  revision: z.string().optional(),
});
export type NotificationType = z.infer<typeof notificationCoreSchema>["type"];
export type NotificationExpiration = z.infer<typeof notificationExpirationSchema>;
export type NotificationInput = z.infer<typeof notificationInputSchema>;
export type AdminNotification = z.infer<typeof adminNotificationSchema>;
