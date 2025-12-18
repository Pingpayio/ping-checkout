import express from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { idempotency } from "../middleware/idempotency.js";
import { sendError } from "../utils/errorResponse.js";
import { redisStore } from "../utils/redis.js";
import {
  CreatePingLinkInputSchema,
  CreatePingLinkOutputSchema,
  GetPingLinkOutputSchema,
} from "../schemas/pingLinkSchemas.js";
import {
  createPingLink as coreCreatePingLink,
  getPingLinkById as coreGetPingLinkById,
} from "../../core/pingLinks/pingLinkService.js";
import type { RequestWithAuth } from "../types.js";

const router = express.Router();

// POST /ping-links
router.post(
  "/ping-links",
  apiKeyAuth(["ping-links:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const parsed = CreatePingLinkInputSchema.parse(req.body);
      const merchantId = req.auth!.merchantId;

      const pingLink = await coreCreatePingLink(merchantId, {
        amount: parsed.amount,
        recipient: parsed.recipient,
        theme: parsed.theme,
        successUrl: parsed.successUrl,
        cancelUrl: parsed.cancelUrl,
        metadata: parsed.metadata,
        idempotencyKey: parsed.idempotencyKey,
      });

      const body = {
        pingLink: {
          pingLinkId: pingLink.id,
          status: pingLink.status,
          amount: pingLink.amount,
          recipient: pingLink.recipient,
          theme: pingLink.theme,
          successUrl: pingLink.successUrl,
          cancelUrl: pingLink.cancelUrl,
          createdAt: pingLink.createdAt,
          expiresAt: pingLink.expiresAt,
          metadata: pingLink.metadata,
        },
      };

      // Optional: validate outgoing payload
      CreatePingLinkOutputSchema.parse(body);

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
      if (err instanceof Error && err.message === "PING_LINK_NOT_FOUND_AFTER_INSERT") {
        return sendError(
          res,
          500,
          "INTERNAL_ERROR",
          "Failed to create ping link",
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

// GET /ping-links/:pingLinkId
router.get(
  "/ping-links/:pingLinkId",
  apiKeyAuth(["ping-links:read"]),
  rateLimit(),
  async (req: RequestWithAuth, res) => {
    try {
      const pingLinkId = req.params.pingLinkId;
      const merchantId = req.auth!.merchantId;

      const pingLink = await coreGetPingLinkById(merchantId, pingLinkId);

      if (!pingLink) {
        return sendError(res, 404, "NOT_FOUND", "Ping Link not found");
      }

      const body = {
        pingLink: {
          pingLinkId: pingLink.id,
          status: pingLink.status,
          amount: pingLink.amount,
          recipient: pingLink.recipient,
          theme: pingLink.theme,
          successUrl: pingLink.successUrl,
          cancelUrl: pingLink.cancelUrl,
          createdAt: pingLink.createdAt,
          expiresAt: pingLink.expiresAt,
          metadata: pingLink.metadata,
        },
      };

      // Optional: validate outgoing payload
      GetPingLinkOutputSchema.parse(body);

      return res.status(200).json(body);
    } catch (err: any) {
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

