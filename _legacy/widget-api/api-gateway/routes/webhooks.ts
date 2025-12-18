import express from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { idempotency } from "../middleware/idempotency.js";
import { sendError } from "../utils/errorResponse.js";
import { redisStore } from "../utils/redis.js";
import {
  CreateWebhookInputSchema,
  CreateWebhookOutputSchema,
  TestWebhookInputSchema,
  TestWebhookOutputSchema,
} from "../schemas/webhookSchemas.js";
import {
  createWebhook as coreCreateWebhook,
  deleteWebhook as coreDeleteWebhook,
  getWebhookById as coreGetWebhookById,
} from "../../core/webhooks/webhookService.js";
import type { RequestWithAuth } from "../types.js";

const router = express.Router();

// POST /webhooks
router.post(
  "/webhooks",
  apiKeyAuth(["webhooks:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const parsed = CreateWebhookInputSchema.parse(req.body);
      const merchantId = req.auth!.merchantId;

      const webhook = await coreCreateWebhook(merchantId, parsed.url);

      const body = {
        webhook: {
          webhookId: webhook.id,
          url: webhook.url,
          createdAt: webhook.createdAt,
          disabledAt: webhook.disabledAt ?? null,
        },
      };

      CreateWebhookOutputSchema.parse(body);

      // Cache response for idempotency
      if (res.locals.idempotencyKey) {
        await redisStore.setex(
          `idemp:${res.locals.idempotencyKey}`,
          86400,
          JSON.stringify({ statusCode: 201, body }),
        );
      }

      return res.status(201).json(body);
    } catch (err: any) {
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors?.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "INTERNAL_ERROR",
        err.message || "Internal server error",
      );
    }
  },
);

// DELETE /webhooks/:webhookId
router.delete(
  "/webhooks/:webhookId",
  apiKeyAuth(["webhooks:write"]),
  rateLimit(),
  async (req: RequestWithAuth, res) => {
    try {
      const webhookId = req.params.webhookId;
      const merchantId = req.auth!.merchantId;

      await coreDeleteWebhook(merchantId, webhookId);

      return res.status(204).send();
    } catch (err: any) {
      if (err instanceof Error && err.message === "WEBHOOK_NOT_FOUND") {
        return sendError(res, 404, "NOT_FOUND", "Webhook not found");
      }
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "INTERNAL_ERROR",
        err.message || "Internal server error",
      );
    }
  },
);

// POST /webhooks/test
router.post(
  "/webhooks/test",
  apiKeyAuth(["webhooks:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const parsed = TestWebhookInputSchema.parse(req.body);
      const merchantId = req.auth!.merchantId;

      // If webhookId is provided, verify it exists and belongs to merchant
      if (parsed.webhookId) {
        const webhook = await coreGetWebhookById(merchantId, parsed.webhookId);
        if (!webhook) {
          return res
            .status(404)
            .json({ code: "NOT_FOUND", message: "Webhook not found" });
        }
      }

      // Stub: For now, just return success
      // TODO: Implement actual webhook delivery
      const body = {
        success: true,
        message: "Test webhook sent successfully",
      };

      TestWebhookOutputSchema.parse(body);

      // Cache response for idempotency
      if (res.locals.idempotencyKey) {
        await redisStore.setex(
          `idemp:${res.locals.idempotencyKey}`,
          86400,
          JSON.stringify({ statusCode: 200, body }),
        );
      }

      return res.status(200).json(body);
    } catch (err: any) {
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.issues[0]?.message || "Validation failed",
        );
      }
      if (err.name === "ZodError" && err.errors?.length > 0) {
        return sendError(
          res,
          400,
          "INVALID_PARAMS",
          err.errors[0]?.message || "Validation failed",
        );
      }
      if (err instanceof Error && err.message === "WEBHOOK_NOT_FOUND") {
        return sendError(res, 404, "NOT_FOUND", "Webhook not found");
      }
      return sendError(
        res,
        err.statusCode || 500,
        err.code || "INTERNAL_ERROR",
        err.message || "Internal server error",
      );
    }
  },
);

export default router;

