// api-gateway/routes/checkout.ts
import { Router, type Request, type Response } from 'express';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { hmacVerify } from '../middleware/hmacVerify.js';
import { idempotency } from '../middleware/idempotency.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendError } from '../utils/errorResponse.js';
import { CreateCheckoutSessionInputSchema, CheckoutSessionSchema } from '../schemas/checkoutSchemas.js';
import { createCheckoutSession, getCheckoutSessionById } from '../../src/services/checkout/checkoutService.js';
import type { RequestWithAuth } from '../types.js';
import { redisStore } from '../utils/redis.js';

const router = Router();

const CHECKOUT_BASE_URL = process.env.CHECKOUT_BASE_URL || 'https://pay.pingpay.io';

// POST /checkout/sessions
router.post(
  '/checkout/sessions',
  apiKeyAuth(['sessions:write']),
  rateLimit(),
  hmacVerify(),
  idempotency(),
  async (req: RequestWithAuth, res: Response) => {
    try {
      const parsed = CreateCheckoutSessionInputSchema.parse(req.body);

      const session = await createCheckoutSession({
        merchantId: req.auth!.merchantId,
        amount: parsed.amount,
        recipient: parsed.recipient,
        theme: parsed.theme,
        successUrl: parsed.successUrl,
        cancelUrl: parsed.cancelUrl,
        metadata: parsed.metadata,
      });

      const sessionRecord = session as any;
      const sessionUrl = `${CHECKOUT_BASE_URL}/checkout/${sessionRecord.id}`;
      const response = {
        session: {
          sessionId: sessionRecord.id,
          status: sessionRecord.status,
          paymentId: sessionRecord.paymentId ?? null,
          amount: sessionRecord.amount,
          recipient: sessionRecord.recipient,
          theme: sessionRecord.theme,
          successUrl: sessionRecord.successUrl,
          cancelUrl: sessionRecord.cancelUrl,
          createdAt: sessionRecord.createdAt,
          expiresAt: sessionRecord.expiresAt,
          sessionUrl,
        },
        sessionUrl,
      };

      // Validate response shape
      CheckoutSessionSchema.parse(response.session);

      // Idempotency middleware handles storage automatically via res.json override
      return res.status(201).json(response);
    } catch (err: any) {
      // Handle Zod validation errors
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        return sendError(res, 400, 'INVALID_PARAMS', err.issues[0]?.message || 'Validation failed');
      }
      if (err.name === 'ZodError' && err.errors && err.errors.length > 0) {
        return sendError(res, 400, 'INVALID_PARAMS', err.errors[0]?.message || 'Validation failed');
      }
      return sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message || 'Internal server error');
    }
  }
);

// GET /checkout/sessions/:sessionId
router.get(
  '/checkout/sessions/:sessionId',
  apiKeyAuth(['sessions:read']),
  rateLimit(),
  async (req: RequestWithAuth, res: Response) => {
    try {
      const sessionId = req.params.sessionId;

      const session = await getCheckoutSessionById(req.auth!.merchantId, sessionId);

      if (!session) {
        return sendError(res, 404, 'NOT_FOUND', 'Checkout session not found');
      }

      const sessionRecord = session as any;
      const sessionUrl = `${CHECKOUT_BASE_URL}/checkout/${sessionRecord.id}`;
      const response = {
        session: {
          sessionId: sessionRecord.id,
          status: sessionRecord.status,
          paymentId: sessionRecord.paymentId ?? null,
          amount: sessionRecord.amount,
          recipient: sessionRecord.recipient,
          theme: sessionRecord.theme,
          successUrl: sessionRecord.successUrl,
          cancelUrl: sessionRecord.cancelUrl,
          createdAt: sessionRecord.createdAt,
          expiresAt: sessionRecord.expiresAt,
          sessionUrl,
        },
      };

      return res.status(200).json(response);
    } catch (err: any) {
      return sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message || 'Internal server error');
    }
  }
);

export default router;

