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

export const pushDeviceSchema = z.object({
  token: z.string().trim().min(8).max(4096),
  platform: z.enum(['android', 'ios']),
});

export const pushDeviceDeleteSchema = z.object({
  token: z.string().trim().min(8).max(4096),
});
