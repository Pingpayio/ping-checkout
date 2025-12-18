// api-gateway/schemas/checkoutSchemas.ts
import { z } from 'zod';

export const PartySchema = z.object({
  address: z.string().min(1),
  chainId: z.string().min(1),
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
  amount: AssetAmountSchema,
  recipient: PartySchema,
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
  sessionUrl: z.string().url(),
});



