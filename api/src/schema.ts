import { z } from 'every-plugin/zod';

export const PartySchema = z.object({
  address: z.string().min(1),
});

export const AssetAmountSchema = z.object({
  assetId: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string integer in smallest units'),
});

export const ThemeSchema = z.object({
  brandColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  buttonText: z.string().optional(),
});

export const CreateCheckoutSessionInputSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a string integer in smallest units'),
  recipient: PartySchema,
  asset: z.object({
    chain: z.string(),
    symbol: z.string(),
  }),
  theme: ThemeSchema.optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const CheckoutSessionSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['CREATED', 'PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED']),
  paymentId: z.string().nullable().optional(),
  amount: AssetAmountSchema,
  recipient: PartySchema,
  theme: ThemeSchema.optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const GetCheckoutSessionInputSchema = z.object({
  sessionId: z.string(),
});

export const CreateCheckoutSessionResponseSchema = z.object({
  session: CheckoutSessionSchema,
  sessionUrl: z.string().url(),
});

export const GetCheckoutSessionResponseSchema = z.object({
  session: CheckoutSessionSchema,
});

export const PaymentRequestSchema = z.object({
  payer: PartySchema,
  recipient: PartySchema,
  asset: AssetAmountSchema,
  memo: z.string().optional(),
  idempotencyKey: z.string(),
});

export const PreparePaymentInputSchema = z.object({
  sessionId: z.string(),
  payerAsset: z.object({
    amount: z.string().regex(/^\d+$/, 'Amount must be a string integer in smallest units'),
    asset: z.object({
      chain: z.string(),
      symbol: z.string(),
    }),
  }), // User-selected payment asset (source) with chain and symbol
  payer: PartySchema, // User's address and chain
  idempotencyKey: z.string(),
});

export const PaymentSchema = z.object({
  paymentId: z.string(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
  request: PaymentRequestSchema,
  feeQuote: z.object({
    totalFee: AssetAmountSchema,
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const QuoteDataSchema = z.object({
  depositAddress: z.string(),
  amountIn: z.string(),
  amountInFormatted: z.string(),
  amountOut: z.string(),
  amountOutFormatted: z.string(),
  deadline: z.string(),
  quoteRequest: z.object({
    originAsset: z.string(),
    destinationAsset: z.string(),
  }).optional(),
}).optional();

export const PreparePaymentResponseSchema = z.object({
  payment: PaymentSchema,
  depositAddress: z.string().optional(),
  quote: QuoteDataSchema,
});

export const SubmitPaymentInputSchema = z.object({
  paymentId: z.string(),
  signedPayload: z.any(),
  idempotencyKey: z.string(),
});

export const SubmitPaymentResponseSchema = z.object({
  payment: PaymentSchema,
});

export const GetPaymentInputSchema = z.object({
  paymentId: z.string(),
});

export const GetPaymentResponseSchema = z.object({
  payment: PaymentSchema,
});

export const GetPaymentStatusInputSchema = z.object({
  depositAddress: z.string(),
});

export const GetPaymentStatusResponseSchema = z.object({
  status: z.enum(['SUCCESS', 'REFUNDED', 'FAILED', 'PENDING', 'PROCESSING']),
  txId: z.string().optional(),
  reason: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Party = z.infer<typeof PartySchema>;
export type AssetAmount = z.infer<typeof AssetAmountSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionInputSchema>;
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;
export type GetCheckoutSessionInput = z.infer<typeof GetCheckoutSessionInputSchema>;
export type CreateCheckoutSessionResponse = z.infer<typeof CreateCheckoutSessionResponseSchema>;
export type GetCheckoutSessionResponse = z.infer<typeof GetCheckoutSessionResponseSchema>;
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;
export type PreparePaymentInput = z.infer<typeof PreparePaymentInputSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type QuoteData = z.infer<typeof QuoteDataSchema>;
export type PreparePaymentResponse = z.infer<typeof PreparePaymentResponseSchema>;
export type SubmitPaymentInput = z.infer<typeof SubmitPaymentInputSchema>;
export type SubmitPaymentResponse = z.infer<typeof SubmitPaymentResponseSchema>;
export type GetPaymentInput = z.infer<typeof GetPaymentInputSchema>;
export type GetPaymentResponse = z.infer<typeof GetPaymentResponseSchema>;
export type GetPaymentStatusInput = z.infer<typeof GetPaymentStatusInputSchema>;
export type GetPaymentStatusResponse = z.infer<typeof GetPaymentStatusResponseSchema>;
