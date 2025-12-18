import { z } from "zod";
import { AssetAmountSchema, PartySchema } from "./checkoutSchemas.js";

export const QuoteRequestSchema = z.object({
  payer: PartySchema,
  recipient: PartySchema,
  asset: AssetAmountSchema,
  metadata: z.record(z.string(), z.any()).optional(),
  idempotencyKey: z.string().uuid(),
});

export const CreateQuoteInputSchema = QuoteRequestSchema;

export const FeeBreakdownItemSchema = z.object({
  label: z.string(),
  amount: AssetAmountSchema,
});

export const QuoteSchema = z.object({
  quoteId: z.string(),
  request: QuoteRequestSchema,
  feeQuote: z.object({
    totalFee: AssetAmountSchema,
    breakdown: z.array(FeeBreakdownItemSchema).optional(),
  }),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const CreateQuoteOutputSchema = z.object({
  quote: QuoteSchema,
});

