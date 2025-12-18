import { z } from "zod";

export const TransactionsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  direction: z.enum(["INCOMING", "OUTGOING"]).optional(),
  currency: z.string().optional(),
  network: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const TransactionSummarySchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  direction: z.enum(["INCOMING", "OUTGOING"]),
  amount: z.string(),
  currency: z.string(),
  network: z.string(),
  sender: z.string().nullable().optional(),
  recipient: z.string().nullable().optional(),
  fees: z.string().nullable().optional(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "CANCELLED"]),
  occurredAt: z.string(),
});

export const ListTransactionsResponseSchema = z.object({
  items: z.array(TransactionSummarySchema),
  nextCursor: z.string().optional(),
});


