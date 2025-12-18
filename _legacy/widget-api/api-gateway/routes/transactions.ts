import express from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { sendError } from "../utils/errorResponse.js";
import {
  TransactionsQuerySchema,
  ListTransactionsResponseSchema,
} from "../schemas/transactionSchemas.js";
import {
  listTransactions,
  type TransactionListFilters,
} from "../../core/transactions/transactionService.js";
import type { RequestWithAuth } from "../types.js";

const router = express.Router();

router.get(
  "/transactions",
  rateLimit(),
  apiKeyAuth(["transactions:read"]),
  hmacVerify(),
  async (req: RequestWithAuth, res) => {
    if (req.auth?.keyType !== "secret") {
      return sendError(
        res,
        403,
        "FORBIDDEN",
        "Secret API key required for transactions",
      );
    }

    try {
      const query = TransactionsQuerySchema.parse(req.query);

      const filters: TransactionListFilters = {
        direction: query.direction,
        currency: query.currency,
        network: query.network,
        limit: query.limit ?? 50,
        cursor: query.cursor,
      };

      if (query.from) {
        filters.from = new Date(query.from);
      }
      if (query.to) {
        filters.to = new Date(query.to);
      }

      const result = await listTransactions(req.auth!.merchantId, filters);
      const response = ListTransactionsResponseSchema.parse(result);
      return res.status(200).json(response);
    } catch (err: any) {
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

      if (err?.code === "MERCHANT_NOT_FOUND" || err?.message === "MERCHANT_NOT_FOUND") {
        return sendError(res, 404, "NOT_FOUND", "Merchant not found");
      }
      if (err?.code === "UNAUTHORIZED" || err?.message === "UNAUTHORIZED") {
        return sendError(res, 403, "FORBIDDEN", "Not authorized to list transactions");
      }

      return sendError(
        res,
        err?.statusCode || 500,
        err?.code || "INTERNAL_ERROR",
        err?.message || "Internal server error",
      );
    }
  },
);

export default router;


