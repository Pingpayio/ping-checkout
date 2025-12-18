import crypto from "crypto";
import { db } from "../db/index.js";

export type Webhook = {
  id: string;
  merchantId: string;
  url: string;
  createdAt: string;
  disabledAt?: string | null;
};

function mapRowToWebhook(row: {
  id: string;
  merchant_id: string;
  url: string;
  created_at: Date;
  deleted_at: Date | null;
}): Webhook {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    url: row.url,
    createdAt: row.created_at.toISOString(),
    disabledAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export async function createWebhook(
  merchantId: string,
  url: string,
): Promise<Webhook> {
  const now = new Date();
  const id = `wh_${crypto.randomUUID()}`;
  await db.webhookSubscriptions.insert({
    id,
    merchant_id: merchantId,
    url,
    created_at: now,
    deleted_at: null,
  });

  return {
    id,
    merchantId,
    url,
    createdAt: now.toISOString(),
    disabledAt: null,
  };
}

export async function deleteWebhook(
  merchantId: string,
  webhookId: string,
): Promise<void> {
  const deletedAt = new Date();
  const changes = await db.webhookSubscriptions.markDeleted(
    webhookId,
    merchantId,
    deletedAt,
  );
  if (changes === 0) {
    throw new Error("WEBHOOK_NOT_FOUND");
  }
}

export async function getWebhookById(
  merchantId: string,
  webhookId: string,
): Promise<Webhook | null> {
  const row = await db.webhookSubscriptions.findOne(
    { id: webhookId, merchant_id: merchantId },
    { includeDeleted: false },
  );
  if (!row) {
    return null;
  }
  return mapRowToWebhook(row);
}

