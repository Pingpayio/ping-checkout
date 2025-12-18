import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { hmacVerify } from "../middleware/hmacVerify.js";
import { idempotency } from "../middleware/idempotency.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  PaymentSchema,
  PreparePaymentInputSchema,
  PreparePaymentOutputSchema,
  SubmitPaymentInputSchema,
  SubmitPaymentOutputSchema,
} from "../schemas/paymentSchemas.js";
import { sendError } from "../utils/errorResponse.js";
import type { RequestWithAuth } from "../types.js";
import {
  getPaymentById as coreGetPaymentById,
  preparePayment as corePreparePayment,
  submitPayment as coreSubmitPayment,
} from "../../core/payments/paymentService.js";

const router = Router();

router.post(
  "/payments/prepare",
  apiKeyAuth(["payments:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const parsed = PreparePaymentInputSchema.parse(req.body);
      const { payment, feeQuote } = await corePreparePayment(
        req.auth!.merchantId,
        parsed.request,
      );

      const body = {
        payment: {
          paymentId: payment.id,
          status: payment.status,
          request: payment.request,
          settlement: payment.settlement,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
        feeQuote: feeQuote ?? undefined,
      };

      PreparePaymentOutputSchema.parse(body);
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

router.get(
  "/payments/:paymentId",
  apiKeyAuth(["payments:read"]),
  rateLimit(),
  async (req: RequestWithAuth, res) => {
    try {
      const paymentId = req.params.paymentId;
      const merchantId = req.auth!.merchantId;

      const payment = await coreGetPaymentById(merchantId, paymentId);
      if (!payment) {
        return res
          .status(404)
          .json({ code: "NOT_FOUND", message: "Payment not found" });
      }

      const body = {
        payment: {
          paymentId: payment.id,
          status: payment.status,
          request: payment.request,
          settlement: payment.settlement,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      PaymentSchema.parse(body.payment);

      return res.status(200).json(body);
    } catch (err: any) {
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
  "/payments/submit",
  apiKeyAuth(["payments:write"]),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res) => {
    try {
      const parsed = SubmitPaymentInputSchema.parse(req.body);
      const payment = await coreSubmitPayment(
        req.auth!.merchantId,
        parsed.paymentId,
        parsed.signedPayload,
      );

      const body = {
        payment: {
          paymentId: payment.id,
          status: payment.status,
          request: payment.request,
          settlement: payment.settlement,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      };

      SubmitPaymentOutputSchema.parse(body);
      return res.status(200).json(body);
    } catch (err: any) {
      if (err?.message === "PAYMENT_NOT_FOUND") {
        return sendError(res, 404, "NOT_FOUND", "Payment not found");
      }
      if (err?.message === "PAYMENT_ALREADY_FINALIZED") {
        return sendError(
          res,
          409,
          "PAYMENT_ALREADY_FINALIZED",
          "Payment is already finalized",
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

