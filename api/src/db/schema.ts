import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const checkoutSessions = sqliteTable(
  "checkout_sessions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    amountAssetId: text("amount_asset_id").notNull(),
    amountValue: text("amount_value").notNull(),
    payerAddress: text("payer_address"),
    payerChainId: text("payer_chain_id"),
    recipientAddress: text("recipient_address").notNull(),
    recipientChainId: text("recipient_chain_id").notNull(),
    themeJson: text("theme_json"),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    status: text("status").notNull().default("CREATED"),
    paymentId: text("payment_id"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    expiresAt: text("expires_at"),
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    merchantIdx: index("idx_checkout_sessions_merchant").on(table.merchantId),
    statusIdx: index("idx_checkout_sessions_status").on(table.status),
  })
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    status: text("status").notNull(),
    payerAddress: text("payer_address").notNull(),
    payerChainId: text("payer_chain_id").notNull(),
    recipientAddress: text("recipient_address").notNull(),
    recipientChainId: text("recipient_chain_id").notNull(),
    assetId: text("asset_id").notNull(),
    amountValue: text("amount_value").notNull(),
    memo: text("memo"),
    idempotencyKey: text("idempotency_key").notNull(),
    quoteTotalFee: text("quote_total_fee"),
    quoteAssetId: text("quote_asset_id"),
    settlementRefs: text("settlement_refs"),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    merchantIdempotencyIdx: uniqueIndex("idx_payments_merchant_idem").on(
      table.merchantId,
      table.idempotencyKey
    ),
    merchantIdx: index("idx_payments_merchant").on(table.merchantId),
  })
);

export const pingLinks = sqliteTable(
  "ping_links",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    amountAssetId: text("amount_asset_id").notNull(),
    amountValue: text("amount_value").notNull(),
    recipientAddress: text("recipient_address").notNull(),
    recipientChainId: text("recipient_chain_id").notNull(),
    themeJson: text("theme_json"),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    metadata: text("metadata"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    expiresAt: text("expires_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    merchantIdempotencyIdx: uniqueIndex("idx_ping_links_merchant_idem").on(
      table.merchantId,
      table.idempotencyKey
    ),
    merchantIdx: index("idx_ping_links_merchant").on(table.merchantId),
    statusIdx: index("idx_ping_links_status").on(table.status),
  })
);

export const webhookSubscriptions = sqliteTable(
  "webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    url: text("url").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    merchantIdx: index("idx_webhook_subscriptions_merchant").on(table.merchantId),
  })
);

export const webhooks = sqliteTable("webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  payload: text("payload").notNull(),
  signature: text("signature"),
  processed: integer("processed").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const quotes = sqliteTable("quotes", {
  quoteId: text("quote_id").primaryKey(),
  payLinkId: text("pay_link_id").notNull(),
  originAsset: text("origin_asset").notNull(),
  destinationAsset: text("destination_asset").notNull(),
  amount: text("amount").notNull(),
  chainId: text("chain_id").notNull(),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("NEW"),
  extStatusId: text("ext_status_id"),
  recipient: text("recipient").notNull(),
  refundTo: text("refund_to").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const orders = sqliteTable("orders", {
  orderId: text("order_id").primaryKey(),
  quoteId: text("quote_id").notNull().unique(),
  status: text("status").notNull().default("PENDING"),
  txId: text("tx_id"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const payLinkAllowlist = sqliteTable(
  "pay_link_allowlist",
  {
    payLinkId: text("pay_link_id").notNull(),
    wallet: text("wallet").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    pk: uniqueIndex("pay_link_allowlist_pk").on(table.payLinkId, table.wallet),
    paylinkIdx: index("idx_allowlist_paylink").on(table.payLinkId),
    walletIdx: index("idx_allowlist_wallet").on(table.wallet),
  })
);

export const payLinks = sqliteTable(
  "pay_links",
  {
    id: text("id").primaryKey(),
    receiveAssetId: text("receive_asset_id").notNull(),
    productJson: text("product_json").notNull(),
    advancedOptionsJson: text("advanced_options_json").notNull(),
    brandingJson: text("branding_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    createdIdx: index("idx_paylinks_created").on(table.createdAt),
  })
);
