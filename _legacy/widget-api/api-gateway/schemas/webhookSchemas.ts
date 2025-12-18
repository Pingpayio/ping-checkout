import { z } from "zod";

export const CreateWebhookInputSchema = z.object({
  url: z.string().url("Invalid URL format"),
});

export const WebhookSchema = z.object({
  webhookId: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
  disabledAt: z.string().nullable().optional(),
});

export const CreateWebhookOutputSchema = z.object({
  webhook: WebhookSchema,
});

export const TestWebhookInputSchema = z.object({
  webhookId: z.string().optional(),
});

export const TestWebhookOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});


