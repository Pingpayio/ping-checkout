import express from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { sendError } from "../utils/errorResponse.js";
import type { RequestWithAdmin } from "../types.js";
import {
  AdminListApiKeysQuerySchema,
  ListApiKeysResponseSchema,
  AdminCreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  ApiKeyIdParamsSchema,
  RegenerateApiKeyResponseSchema,
  RevokeApiKeyResponseSchema,
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
  type ApiKeySummary,
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

router.get(
  "/admin/api-keys",
  rateLimit(),
  adminAuth(),
  async (req: RequestWithAdmin, res) => {
    try {
      const query = AdminListApiKeysQuerySchema.parse(req.query);
      const { merchantId } = query;

      const apiKeys = await listApiKeys(merchantId);
      const normalized = apiKeys.map(normalizeApiKeyDates);
      const response = { items: normalized };

      const validated = ListApiKeysResponseSchema.parse(response);
      return res.status(200).json(validated);
    } catch (err: any) {
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
  "/admin/api-keys",
  rateLimit(),
  adminAuth(),
  async (req: RequestWithAdmin, res) => {
    try {
      const body = AdminCreateApiKeyBodySchema.parse(req.body ?? {});

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
        merchantId: body.merchantId,
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
        return sendError(res, 404, "NOT_FOUND", err.message || "Merchant not found");
      }
      if (err instanceof InvalidApiKeyConfigError) {
        return sendError(
          res,
          400,
          "INVALID_API_KEY_CONFIG",
          err.message || "Invalid API key configuration",
        );
      }
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        const firstIssue = err.issues[0];
        if (
          firstIssue.path.includes("allowedOrigins") &&
          firstIssue.code === "custom"
        ) {
          return sendError(
            res,
            400,
            "INVALID_API_KEY_CONFIG",
            firstIssue.message || "allowedOrigins is required for publishable keys",
          );
        }
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          firstIssue.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors && err.errors.length > 0) {
        const firstError = err.errors[0];
        if (
          firstError.path.includes("allowedOrigins") &&
          firstError.code === "custom"
        ) {
          return sendError(
            res,
            400,
            "INVALID_API_KEY_CONFIG",
            firstError.message || "allowedOrigins is required for publishable keys",
          );
        }
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          firstError.message || "Validation failed",
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
  "/admin/api-keys/:id/regenerate",
  rateLimit(),
  adminAuth(),
  async (req: RequestWithAdmin, res) => {
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
  "/admin/api-keys/:id/revoke",
  rateLimit(),
  adminAuth(),
  async (req: RequestWithAdmin, res) => {
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

export default router;

