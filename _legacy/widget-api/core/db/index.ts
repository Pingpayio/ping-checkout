import { db as sqliteDb } from "../../src/db/sqlite.js";

type SettlementRefRecord = {
  chainId: string;
  txHash: string;
};

type PaymentCriteria = Partial<{
  id: string;
  merchant_id: string;
  idempotency_key: string;
}>;

type PaymentInsertRecord = {
  id: string;
  merchant_id: string;
  status: string;
  payer_address: string;
  payer_chain_id: string;
  recipient_address: string;
  recipient_chain_id: string;
  asset_id: string;
  amount_value: string;
  memo: string | null;
  idempotency_key: string;
  quote_total_fee: string | null;
  quote_asset_id: string | null;
  settlement_refs: SettlementRefRecord[] | null;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
};

type PaymentRow = {
  id: string;
  merchant_id: string;
  status: string;
  payer_address: string;
  payer_chain_id: string;
  recipient_address: string;
  recipient_chain_id: string;
  asset_id: string;
  amount_value: string;
  memo: string | null;
  idempotency_key: string;
  quote_total_fee: string | null;
  quote_asset_id: string | null;
  settlement_refs: SettlementRefRecord[] | null;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
};

type WebhookInsertRecord = {
  id: string;
  merchant_id: string;
  url: string;
  created_at: Date;
  deleted_at: Date | null;
};

type WebhookCriteria = Partial<{
  id: string;
  merchant_id: string;
}>;

type WebhookRow = {
  id: string;
  merchant_id: string;
  url: string;
  created_at: Date;
  deleted_at: Date | null;
};

function normalizePaymentRow(row: any): PaymentRow {
  let settlementRefs: SettlementRefRecord[] | null = null;
  if (row.settlement_refs) {
    try {
      const parsed = JSON.parse(row.settlement_refs);
      if (Array.isArray(parsed)) {
        settlementRefs = parsed.filter(
          (item) =>
            item &&
            typeof item.chainId === "string" &&
            typeof item.txHash === "string",
        );
      }
    } catch {
      settlementRefs = null;
    }
  }

  return {
    id: row.id,
    merchant_id: row.merchant_id,
    status: row.status,
    payer_address: row.payer_address,
    payer_chain_id: row.payer_chain_id,
    recipient_address: row.recipient_address,
    recipient_chain_id: row.recipient_chain_id,
    asset_id: row.asset_id,
    amount_value: row.amount_value,
    memo: row.memo,
    idempotency_key: row.idempotency_key,
    quote_total_fee: row.quote_total_fee,
    quote_asset_id: row.quote_asset_id,
    settlement_refs: settlementRefs,
    metadata: row.metadata,
    created_at:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at
        : new Date(row.updated_at),
  };
}

function buildWhereClause(criteria: PaymentCriteria): {
  clause: string;
  params: Record<string, unknown>;
} {
  const entries = Object.entries(criteria).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) {
    throw new Error("PAYMENTS_FINDONE_EMPTY_CRITERIA");
  }

  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    clauses.push(`${key} = @${key}`);
    params[key] = value;
  }

  return {
    clause: clauses.join(" AND "),
    params,
  };
}

const paymentsTable = {
  async findOne(criteria: PaymentCriteria): Promise<PaymentRow | null> {
    const { clause, params } = buildWhereClause(criteria);
    const stmt = sqliteDb.prepare(
      `SELECT * FROM payments WHERE ${clause} LIMIT 1`,
    );
    const row = stmt.get(params);
    return row ? normalizePaymentRow(row) : null;
  },
  async insert(record: PaymentInsertRecord): Promise<void> {
    const stmt = sqliteDb.prepare(`
      INSERT INTO payments (
        id,
        merchant_id,
        status,
        payer_address,
        payer_chain_id,
        recipient_address,
        recipient_chain_id,
        asset_id,
        amount_value,
        memo,
        idempotency_key,
        quote_total_fee,
        quote_asset_id,
        settlement_refs,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @merchant_id,
        @status,
        @payer_address,
        @payer_chain_id,
        @recipient_address,
        @recipient_chain_id,
        @asset_id,
        @amount_value,
        @memo,
        @idempotency_key,
        @quote_total_fee,
        @quote_asset_id,
        @settlement_refs,
        @metadata,
        @created_at,
        @updated_at
      )
    `);

    stmt.run({
      ...record,
      settlement_refs: record.settlement_refs
        ? JSON.stringify(record.settlement_refs)
        : null,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
    });
  },
};

function normalizeWebhookRow(row: any): WebhookRow {
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    url: row.url,
    created_at:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    deleted_at:
      row.deleted_at == null
        ? null
        : row.deleted_at instanceof Date
        ? row.deleted_at
        : new Date(row.deleted_at),
  };
}

function buildWebhookWhereClause(
  criteria: WebhookCriteria,
  includeDeleted: boolean,
): { clause: string; params: Record<string, unknown> } {
  const entries = Object.entries(criteria).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) {
    throw new Error("WEBHOOKS_FINDONE_EMPTY_CRITERIA");
  }

  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    clauses.push(`${key} = @${key}`);
    params[key] = value;
  }

  if (!includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  return {
    clause: clauses.join(" AND "),
    params,
  };
}

const webhookSubscriptionsTable = {
  async insert(record: WebhookInsertRecord): Promise<void> {
    const stmt = sqliteDb.prepare(`
      INSERT INTO webhook_subscriptions (
        id,
        merchant_id,
        url,
        created_at,
        deleted_at
      ) VALUES (
        @id,
        @merchant_id,
        @url,
        @created_at,
        @deleted_at
      )
    `);

    stmt.run({
      ...record,
      created_at: record.created_at.toISOString(),
      deleted_at: record.deleted_at ? record.deleted_at.toISOString() : null,
    });
  },
  async findOne(
    criteria: WebhookCriteria,
    options: { includeDeleted?: boolean } = {},
  ): Promise<WebhookRow | null> {
    const { clause, params } = buildWebhookWhereClause(
      criteria,
      Boolean(options.includeDeleted),
    );
    const stmt = sqliteDb.prepare(
      `SELECT * FROM webhook_subscriptions WHERE ${clause} LIMIT 1`,
    );
    const row = stmt.get(params);
    return row ? normalizeWebhookRow(row) : null;
  },
  async markDeleted(
    id: string,
    merchantId: string,
    deletedAt: Date,
  ): Promise<number> {
    const stmt = sqliteDb.prepare(`
      UPDATE webhook_subscriptions
      SET deleted_at = @deleted_at
      WHERE id = @id AND merchant_id = @merchant_id AND deleted_at IS NULL
    `);
    const result = stmt.run({
      id,
      merchant_id: merchantId,
      deleted_at: deletedAt.toISOString(),
    });
    return result.changes;
  },
};

type PingLinkInsertRecord = {
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
  idempotency_key: string;
  created_at: Date;
  expires_at: Date | null;
  deleted_at: Date | null;
};

type PingLinkCriteria = Partial<{
  id: string;
  merchant_id: string;
  idempotency_key: string;
}>;

type PingLinkRow = {
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
  idempotency_key: string;
  created_at: Date;
  expires_at: Date | null;
  deleted_at: Date | null;
};

function normalizePingLinkRow(row: any): PingLinkRow {
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    status: row.status,
    amount_asset_id: row.amount_asset_id,
    amount_value: row.amount_value,
    recipient_address: row.recipient_address,
    recipient_chain_id: row.recipient_chain_id,
    theme_json: row.theme_json,
    success_url: row.success_url,
    cancel_url: row.cancel_url,
    metadata: row.metadata,
    idempotency_key: row.idempotency_key,
    created_at:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    expires_at:
      row.expires_at == null
        ? null
        : row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at),
    deleted_at:
      row.deleted_at == null
        ? null
        : row.deleted_at instanceof Date
        ? row.deleted_at
        : new Date(row.deleted_at),
  };
}

function buildPingLinkWhereClause(
  criteria: PingLinkCriteria,
  includeDeleted: boolean,
): { clause: string; params: Record<string, unknown> } {
  const entries = Object.entries(criteria).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) {
    throw new Error("PING_LINKS_FINDONE_EMPTY_CRITERIA");
  }

  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    clauses.push(`${key} = @${key}`);
    params[key] = value;
  }

  if (!includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  return {
    clause: clauses.join(" AND "),
    params,
  };
}

const pingLinksTable = {
  async insert(record: PingLinkInsertRecord): Promise<void> {
    const stmt = sqliteDb.prepare(`
      INSERT INTO ping_links (
        id,
        merchant_id,
        status,
        amount_asset_id,
        amount_value,
        recipient_address,
        recipient_chain_id,
        theme_json,
        success_url,
        cancel_url,
        metadata,
        idempotency_key,
        created_at,
        expires_at,
        deleted_at
      ) VALUES (
        @id,
        @merchant_id,
        @status,
        @amount_asset_id,
        @amount_value,
        @recipient_address,
        @recipient_chain_id,
        @theme_json,
        @success_url,
        @cancel_url,
        @metadata,
        @idempotency_key,
        @created_at,
        @expires_at,
        @deleted_at
      )
    `);

    stmt.run({
      ...record,
      created_at: record.created_at.toISOString(),
      expires_at: record.expires_at ? record.expires_at.toISOString() : null,
      deleted_at: record.deleted_at ? record.deleted_at.toISOString() : null,
    });
  },
  async findOne(
    criteria: PingLinkCriteria,
    options: { includeDeleted?: boolean } = {},
  ): Promise<PingLinkRow | null> {
    const { clause, params } = buildPingLinkWhereClause(
      criteria,
      Boolean(options.includeDeleted),
    );
    const stmt = sqliteDb.prepare(
      `SELECT * FROM ping_links WHERE ${clause} LIMIT 1`,
    );
    const row = stmt.get(params);
    return row ? normalizePingLinkRow(row) : null;
  },
};

export const db = {
  payments: paymentsTable,
  webhookSubscriptions: webhookSubscriptionsTable,
  pingLinks: pingLinksTable,
};

