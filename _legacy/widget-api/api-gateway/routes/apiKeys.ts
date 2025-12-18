import express from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { sendError } from "../utils/errorResponse.js";
import type { RequestWithAuth } from "../types.js";
import {
  ListApiKeysResponseSchema,
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  ApiKeyIdParamsSchema,
  RegenerateApiKeyResponseSchema,
  RevokeApiKeyResponseSchema,
  ApiKeyUsageParamsSchema,
  ApiKeyUsageQuerySchema,
  ApiKeyUsageResponseSchema,
} from "../schemas/apiKeySchemas.js";
import {
  listApiKeys,
  MerchantNotFoundError,
  createApiKey,
  InvalidApiKeyConfigError,
  regenerateApiKey,
  revokeApiKey,
  ApiKeyNotFoundError,
  ApiKeyRevokedError,
  getApiKeyUsage,
  type ApiKeySummary,
  type ApiKeyUsageSummary,
} from "../../core/apiKeys/apiKeyService.js";

const router = express.Router();

function normalizeApiKeyDates(key: ApiKeySummary) {
  const toIso = (value?: Date | string | null) => {
    if (!value) return value ?? null;
    return value instanceof Date ? value.toISOString() : value;
  };

  return {
    ...key,
    createdAt: toIso(key.createdAt),
    revokedAt: toIso(key.revokedAt),
    lastUsedAt: toIso(key.lastUsedAt),
  };
}

function normalizeUsageDates(usage: ApiKeyUsageSummary) {
  const toIso = (value?: Date | string | null) => {
    if (!value) return undefined;
    return value instanceof Date ? value.toISOString() : value;
  };

  const toIsoDate = (value: Date | string) => {
    if (value instanceof Date) {
      // Convert to ISO date string (YYYY-MM-DD)
      return value.toISOString().split('T')[0];
    }
    // If already a string, assume it's already in the correct format
    return value;
  };

  return {
    ...usage,
    firstSeenAt: toIso(usage.firstSeenAt),
    lastSeenAt: toIso(usage.lastSeenAt),
    byDay: usage.byDay.map((day) => ({
      ...day,
      date: toIsoDate(day.date),
    })),
  };
}

router.get(
  "/api-keys",
  rateLimit(),
  apiKeyAuth(["api-keys:read"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required to list API keys",
      );
    }

    try {
      const apiKeys = await listApiKeys(req.auth!.merchantId);
      const normalized = apiKeys.map(normalizeApiKeyDates);
      const response = { items: normalized };
      const validated = ListApiKeysResponseSchema.parse(response);
      return res.status(200).json(validated);
    } catch (err: any) {
      if (err instanceof MerchantNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message);
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Unexpected error",
      );
    }
  },
);

router.post(
  "/api-keys",
  rateLimit(),
  apiKeyAuth(["api-keys:write"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required to create API keys",
      );
    }

    try {
      const body = CreateApiKeyBodySchema.parse(req.body ?? {});

      if (
        body.type === "publishable" &&
        (!body.allowedOrigins || body.allowedOrigins.length === 0)
      ) {
        return sendError(
          res,
          400,
          "INVALID_API_KEY_CONFIG",
          "allowedOrigins is required for publishable keys",
        );
      }

      const result = await createApiKey({
        merchantId: req.auth!.merchantId,
        label: body.label,
        type: body.type,
        allowedOrigins: body.allowedOrigins,
        scopes: body.scopes,
      });

      const response = {
        apiKey: normalizeApiKeyDates(result.apiKey),
        plainTextKey: result.plainTextKey,
      };

      const validated = CreateApiKeyResponseSchema.parse(response);
      return res.status(201).json(validated);
    } catch (err: any) {
      if (err instanceof MerchantNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message);
      }
      if (err instanceof InvalidApiKeyConfigError) {
        return sendError(
          res,
          400,
          "INVALID_API_KEY_CONFIG",
          err.message,
        );
      }
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors && err.errors.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Unexpected error",
      );
    }
  },
);

router.post(
  "/api-keys/:id/regenerate",
  rateLimit(),
  apiKeyAuth(["api-keys:write"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required to manage API keys",
      );
    }

    try {
      const params = ApiKeyIdParamsSchema.parse(req.params);
      const { id } = params;

      const result = await regenerateApiKey({ keyId: id });
      const normalizedApiKey = normalizeApiKeyDates(result.apiKey);
      const response = {
        apiKey: normalizedApiKey,
        plainTextKey: result.plainTextKey,
      };

      const validated = RegenerateApiKeyResponseSchema.parse(response);
      return res.status(200).json(validated);
    } catch (err: any) {
      if (err instanceof ApiKeyNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "API key not found");
      }
      if (err instanceof ApiKeyRevokedError) {
        return sendError(res, 400, "API_KEY_REVOKED", err.message || "API key is revoked");
      }
      if (err instanceof MerchantNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "Merchant not found");
      }
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors && err.errors.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Unexpected error",
      );
    }
  },
);

router.post(
  "/api-keys/:id/revoke",
  rateLimit(),
  apiKeyAuth(["api-keys:write"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required to manage API keys",
      );
    }

    try {
      const params = ApiKeyIdParamsSchema.parse(req.params);
      const { id } = params;

      const apiKey = await revokeApiKey({ keyId: id });
      const normalizedApiKey = normalizeApiKeyDates(apiKey);
      const response = {
        apiKey: normalizedApiKey,
      };

      const validated = RevokeApiKeyResponseSchema.parse(response);
      return res.status(200).json(validated);
    } catch (err: any) {
      if (err instanceof ApiKeyNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "API key not found");
      }
      if (err instanceof MerchantNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "Merchant not found");
      }
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors && err.errors.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Unexpected error",
      );
    }
  },
);

router.get(
  "/api-keys/:id/usage",
  rateLimit(),
  apiKeyAuth(["api-keys:read"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required to view API key usage",
      );
    }

    try {
      const params = ApiKeyUsageParamsSchema.parse(req.params);
      const { id } = params;
      const filtersRaw = ApiKeyUsageQuerySchema.parse(req.query);

      const filters = {
        from: filtersRaw.from ? new Date(filtersRaw.from) : undefined,
        to: filtersRaw.to ? new Date(filtersRaw.to) : undefined,
        limitDays: filtersRaw.limitDays,
      };

      const summary = await getApiKeyUsage(req.auth!.merchantId, id, filters);
      const normalized = normalizeUsageDates(summary);
      const validated = ApiKeyUsageResponseSchema.parse(normalized);
      return res.status(200).json(validated);
    } catch (err: any) {
      if (err instanceof MerchantNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "Merchant not found");
      }
      if (err instanceof ApiKeyNotFoundError) {
        return sendError(res, 404, "NOT_FOUND", err.message || "API key not found");
      }
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors && err.errors.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Unexpected error",
      );
    }
  },
);

export default router;


