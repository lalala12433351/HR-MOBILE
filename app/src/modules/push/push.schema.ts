import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(4096),
});
