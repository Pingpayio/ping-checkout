import { z } from "zod";

export const ApiKeySummarySchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  label: z.string().nullable().optional(),
  type: z.enum(["secret", "publishable"]),
  status: z.enum(["active", "revoked"]),
  allowedOrigins: z.array(z.string()),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  revokedAt: z.string().nullable().optional(),
  lastUsedAt: z.string().nullable().optional(),
});

export const ListApiKeysResponseSchema = z.object({
  items: z.array(ApiKeySummarySchema),
});

export const CreateApiKeyBodySchema = z.object({
  label: z.string().max(100).optional(),
  type: z.enum(["secret", "publishable"]),
  allowedOrigins: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});

export const CreateApiKeyResponseSchema = z.object({
  apiKey: ApiKeySummarySchema,
  plainTextKey: z.string(),
});

export const ApiKeyIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const RegenerateApiKeyResponseSchema = z.object({
  apiKey: ApiKeySummarySchema,
  plainTextKey: z.string(),
});

export const RevokeApiKeyResponseSchema = z.object({
  apiKey: ApiKeySummarySchema,
});

export const ApiKeyUsageParamsSchema = z.object({
  id: z.string().min(1),
});

export const ApiKeyUsageQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limitDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const ApiKeyUsageByDaySchema = z.object({
  date: z.string(),
  totalRequests: z.number().int(),
  successCount: z.number().int(),
  errorCount: z.number().int(),
});

export const ApiKeyUsageResponseSchema = z.object({
  apiKeyId: z.string(),
  merchantId: z.string(),
  totalRequests: z.number().int(),
  successCount: z.number().int(),
  errorCount: z.number().int(),
  firstSeenAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  byDay: z.array(ApiKeyUsageByDaySchema),
});

export const AdminListApiKeysQuerySchema = z.object({
  merchantId: z.string().min(1),
});

export const AdminCreateApiKeyBodySchema = z
  .object({
    merchantId: z.string().min(1),
    label: z.string().max(100).optional(),
    type: z.enum(["secret", "publishable"]),
    allowedOrigins: z.array(z.string()).optional(),
    scopes: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.type === "publishable" &&
      (!data.allowedOrigins || data.allowedOrigins.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowedOrigins must be provided for publishable keys",
        path: ["allowedOrigins"],
      });
    }
  });


