import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { idempotency } from "../middleware/idempotency.js";
import {
  CreateQuoteInputSchema,
  CreateQuoteOutputSchema,
} from "../schemas/quoteSchemas.js";
import { sendError } from "../utils/errorResponse.js";
import type { RequestWithAuth } from "../types.js";
import { createQuote as coreCreateQuote } from "../../core/quotes/quoteService.js";

const router = Router();

router.post(
  "/quotes",
  apiKeyAuth(["quotes:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const input = CreateQuoteInputSchema.parse(req.body);
      const merchantId = req.auth!.merchantId;

      const quote = await coreCreateQuote(merchantId, input);

      const body = {
        quote: {
          quoteId: quote.id,
          request: quote.request,
          feeQuote: quote.feeQuote,
          expiresAt: quote.expiresAt,
          createdAt: quote.createdAt,
        },
      };

      CreateQuoteOutputSchema.parse(body);
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

export default router;


