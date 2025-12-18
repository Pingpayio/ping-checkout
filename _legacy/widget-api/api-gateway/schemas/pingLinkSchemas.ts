import { z } from "zod";
import { ThemeSchema } from "./checkoutSchemas.js";

// Re-define these to avoid potential import issues
const PartySchema = z.object({
  address: z.string().min(1),
  chainId: z.string().min(1),
});

const AssetAmountSchema = z.object({
  assetId: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string integer in smallest units'),
});

export const CreatePingLinkInputSchema = z.object({
  amount: AssetAmountSchema,
  recipient: PartySchema,
  theme: ThemeSchema.optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().uuid(),
});

export const PingLinkSchema = z.object({
  pingLinkId: z.string(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
  amount: AssetAmountSchema,
  recipient: PartySchema,
  theme: ThemeSchema.optional(),
  successUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CreatePingLinkOutputSchema = z.object({
  pingLink: PingLinkSchema,
});

export const GetPingLinkOutputSchema = z.object({
  pingLink: PingLinkSchema,
});

