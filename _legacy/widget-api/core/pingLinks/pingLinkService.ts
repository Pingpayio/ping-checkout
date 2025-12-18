import crypto from "crypto";
import { db } from "../db/index.js";
import type { Party, AssetAmount } from "../payments/paymentService.js";

export type PingLinkStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";

export type ThemeConfig = {
  brandColor?: string;
  logoUrl?: string;
  buttonText?: string;
};

export type CreatePingLinkInput = {
  amount: AssetAmount;
  recipient: Party;
  theme?: ThemeConfig;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
};

export type PingLink = {
  id: string;
  merchantId: string;
  status: PingLinkStatus;
  amount: AssetAmount;
  recipient: Party;
  theme?: ThemeConfig;
  successUrl?: string | null;
  cancelUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt: string | null;
};

function mapRowToPingLink(row: {
  id: string;
  merchant_id: string;
  status: string;
  amount_asset_id: string;
  amount_value: string;
  recipient_address: string;
  recipient_chain_id: string;
  theme_json: string | null;
  success_url: string | null;
  cancel_url: string | null;
  metadata: string | null;
  created_at: Date;
  expires_at: Date | null;
}): PingLink {
  let metadata: Record<string, unknown> | undefined = undefined;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = undefined;
    }
  }

  let theme: ThemeConfig | undefined = undefined;
  if (row.theme_json) {
    try {
      theme = JSON.parse(row.theme_json) as ThemeConfig;
    } catch {
      theme = undefined;
    }
  }

  return {
    id: row.id,
    merchantId: row.merchant_id,
    status: row.status as PingLinkStatus,
    amount: {
      assetId: row.amount_asset_id,
      amount: row.amount_value,
    },
    recipient: {
      address: row.recipient_address,
      chainId: row.recipient_chain_id,
    },
    theme,
    successUrl: row.success_url,
    cancelUrl: row.cancel_url,
    metadata,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
  };
}

export async function createPingLink(
  merchantId: string,
  input: CreatePingLinkInput,
): Promise<PingLink> {
  // Check for existing ping link by idempotency key
  const existing = await db.pingLinks.findOne(
    { merchant_id: merchantId, idempotency_key: input.idempotencyKey },
    { includeDeleted: false },
  );

  if (existing) {
    return mapRowToPingLink(existing);
  }

  const now = new Date();
  const id = `plink_${crypto.randomUUID()}`;
  // Default expiry: 30 days from now
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.pingLinks.insert({
    id,
    merchant_id: merchantId,
    status: "ACTIVE",
    amount_asset_id: input.amount.assetId,
    amount_value: input.amount.amount,
    recipient_address: input.recipient.address,
    recipient_chain_id: input.recipient.chainId,
    theme_json: input.theme ? JSON.stringify(input.theme) : null,
    success_url: input.successUrl || null,
    cancel_url: input.cancelUrl || null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    idempotency_key: input.idempotencyKey,
    created_at: now,
    expires_at: expiresAt,
    deleted_at: null,
  });

  const row = await db.pingLinks.findOne(
    { id, merchant_id: merchantId },
    { includeDeleted: false },
  );

  if (!row) {
    throw new Error("PING_LINK_NOT_FOUND_AFTER_INSERT");
  }

  return mapRowToPingLink(row);
}

export async function getPingLinkById(
  merchantId: string,
  pingLinkId: string,
): Promise<PingLink | null> {
  const row = await db.pingLinks.findOne(
    { id: pingLinkId, merchant_id: merchantId },
    { includeDeleted: false },
  );

  if (!row) {
    return null;
  }

  return mapRowToPingLink(row);
}


