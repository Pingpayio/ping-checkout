import crypto from "crypto";
import { db } from "../db/index.js";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

export type Party = {
  address: string;
  chainId: string;
};

export type AssetAmount = {
  assetId: string;
  amount: string; // smallest unit as string integer
};

export type PaymentRequest = {
  payer: Party;
  recipient: Party;
  asset: AssetAmount;
  memo?: string;
  idempotencyKey: string;
};

export type SettlementRef = {
  chainId: string;
  txHash: string;
};

export type Payment = {
  id: string;
  merchantId: string;
  status: PaymentStatus;
  request: PaymentRequest;
  settlement?: {
    txRefs: SettlementRef[];
  };
  createdAt: string;
  updatedAt: string;
};

export type FeeQuote = {
  totalFee: AssetAmount;
  breakdown?: {
    label: string;
    amount: AssetAmount;
  }[];
};

function mapRowToPayment(row: any): Payment {
  const createdAt =
    row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  const updatedAt =
    row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);

  const payment: Payment = {
    id: row.id,
    merchantId: row.merchant_id,
    status: row.status,
    request: {
      payer: {
        address: row.payer_address,
        chainId: row.payer_chain_id,
      },
      recipient: {
        address: row.recipient_address,
        chainId: row.recipient_chain_id,
      },
      asset: {
        assetId: row.asset_id,
        amount: row.amount_value,
      },
      memo: row.memo ?? undefined,
      idempotencyKey: row.idempotency_key,
    },
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };

  if (Array.isArray(row.settlement_refs) && row.settlement_refs.length > 0) {
    payment.settlement = {
      txRefs: row.settlement_refs as SettlementRef[],
    };
  }

  return payment;
}

async function getFeeQuoteForPayment(
  _request: PaymentRequest,
): Promise<FeeQuote | undefined> {
  return undefined;
}

export async function preparePayment(
  merchantId: string,
  request: PaymentRequest,
): Promise<{ payment: Payment; feeQuote?: FeeQuote }> {
  const existing = await db.payments.findOne({
    merchant_id: merchantId,
    idempotency_key: request.idempotencyKey,
  });

  if (existing) {
    const payment = mapRowToPayment(existing);
    return { payment };
  }

  const id = `pay_${crypto.randomUUID()}`;
  const now = new Date();
  const feeQuote = await getFeeQuoteForPayment(request);

  await db.payments.insert({
    id,
    merchant_id: merchantId,
    status: "PENDING",
    payer_address: request.payer.address,
    payer_chain_id: request.payer.chainId,
    recipient_address: request.recipient.address,
    recipient_chain_id: request.recipient.chainId,
    asset_id: request.asset.assetId,
    amount_value: request.asset.amount,
    memo: request.memo ?? null,
    idempotency_key: request.idempotencyKey,
    quote_total_fee: feeQuote ? feeQuote.totalFee.amount : null,
    quote_asset_id: feeQuote ? feeQuote.totalFee.assetId : null,
    settlement_refs: null,
    created_at: now,
    updated_at: now,
    metadata: null,
  });

  const row = await db.payments.findOne({ id, merchant_id: merchantId });
  if (!row) {
    throw new Error("PAYMENT_NOT_FOUND_AFTER_INSERT");
  }

  const payment = mapRowToPayment(row);
  return { payment, feeQuote };
}

export async function submitPayment(
  merchantId: string,
  paymentId: string,
  signedPayload: unknown,
): Promise<Payment> {
  throw new Error("submitPayment not implemented yet");
}

export async function getPaymentById(
  merchantId: string,
  paymentId: string,
): Promise<Payment | null> {
  const row = await db.payments.findOne({
    id: paymentId,
    merchant_id: merchantId,
  });

  if (!row) {
    return null;
  }

  return mapRowToPayment(row);
}

