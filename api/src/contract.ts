import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';
import {
  CreateCheckoutSessionInputSchema,
  CreateCheckoutSessionResponseSchema,
  GetCheckoutSessionInputSchema,
  GetCheckoutSessionResponseSchema,
  PaymentRequestSchema,
  PreparePaymentInputSchema,
  PreparePaymentResponseSchema,
  SubmitPaymentInputSchema,
  SubmitPaymentResponseSchema,
  GetPaymentInputSchema,
  GetPaymentResponseSchema,
} from './schema';

export const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({
      status: z.literal('ok'),
      timestamp: z.iso.datetime(),
    })),

  checkout: oc.router({
    createSession: oc
      .route({ method: 'POST', path: '/checkout/sessions' })
      .input(CreateCheckoutSessionInputSchema)
      .output(CreateCheckoutSessionResponseSchema),

    getSession: oc
      .route({ method: 'GET', path: '/checkout/sessions/{sessionId}' })
      .input(GetCheckoutSessionInputSchema)
      .output(GetCheckoutSessionResponseSchema),
  }),

  payments: oc.router({
    prepare: oc
      .route({ method: 'POST', path: '/payments/prepare' })
      .input(z.object({ input: PreparePaymentInputSchema }))
      .output(PreparePaymentResponseSchema),

    submit: oc
      .route({ method: 'POST', path: '/payments/submit' })
      .input(SubmitPaymentInputSchema)
      .output(SubmitPaymentResponseSchema),

    get: oc
      .route({ method: 'GET', path: '/payments/{paymentId}' })
      .input(GetPaymentInputSchema)
      .output(GetPaymentResponseSchema),
  }),
});

export type ContractType = typeof contract;
