import { z } from "zod";
import { AssetAmountSchema, PartySchema } from "./checkoutSchemas.js";

export const PaymentRequestSchema = z.object({
  payer: PartySchema,
  recipient: PartySchema,
  asset: AssetAmountSchema,
  memo: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

export const PreparePaymentInputSchema = z.object({
  request: PaymentRequestSchema,
});

const SettlementRefSchema = z.object({
  chainId: z.string(),
  txHash: z.string(),
});

export const PaymentSchema = z.object({
  paymentId: z.string(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]),
  request: PaymentRequestSchema,
  settlement: z
    .object({
      txRefs: z.array(SettlementRefSchema),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PreparePaymentOutputSchema = z.object({
  payment: PaymentSchema,
  feeQuote: z
    .object({
      totalFee: AssetAmountSchema,
      breakdown: z
        .array(
          z.object({
            label: z.string(),
            amount: AssetAmountSchema,
          }),
        )
        .optional(),
    })
    .optional(),
});

export const SubmitPaymentInputSchema = z.object({
  paymentId: z.string(),
  signedPayload: z.unknown(),
  idempotencyKey: z.string().uuid(),
});

export const SubmitPaymentOutputSchema = z.object({
  payment: PaymentSchema,
});

