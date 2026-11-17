import { z } from "zod";

export const systemSettingsSchema = z.object({
  acceptingApplications: z.boolean(),
}).strict();

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
