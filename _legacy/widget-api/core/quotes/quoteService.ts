import crypto from "crypto";
import type { AssetAmount, Party } from "../payments/paymentService.js";

export type QuoteRequest = {
  payer: Party;
  recipient: Party;
  asset: AssetAmount;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
};

export type FeeBreakdownItem = {
  label: string;
  amount: AssetAmount;
};

export type FeeQuote = {
  totalFee: AssetAmount;
  breakdown?: FeeBreakdownItem[];
};

export type Quote = {
  id: string;
  merchantId: string;
  request: QuoteRequest;
  feeQuote: FeeQuote;
  expiresAt: string;
  createdAt: string;
};

export async function createQuote(
  merchantId: string,
  request: QuoteRequest,
): Promise<Quote> {
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);
  return {
    id: `quote_${crypto.randomUUID()}`,
    merchantId,
    request,
    feeQuote: {
      totalFee: {
        assetId: request.asset.assetId,
        amount: "0",
      },
    },
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

