// src/db/sqlite.js
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path - use environment variable or fallback to project root
const dbPath = process.env.SQLITE_PATH || join(__dirname, '../../quotes.db');
export const db = new Database(dbPath);

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      quote_id TEXT PRIMARY KEY,
      pay_link_id TEXT NOT NULL,
      origin_asset TEXT NOT NULL,
      destination_asset TEXT NOT NULL,
      amount TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',  -- NEW|PENDING|PAID|FAILED|EXPIRED
      ext_status_id TEXT,  -- External status ID for 1-Click API
      recipient TEXT NOT NULL,  -- Merchant destination address
      refund_to TEXT NOT NULL,  -- Payer origin address
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS orders (
      order_id        TEXT PRIMARY KEY,
      quote_id        TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|PAID|FAILED|EXPIRED
      tx_id           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
    );
    
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      payload TEXT NOT NULL,
      signature TEXT,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
            CREATE TABLE IF NOT EXISTS pay_link_allowlist (
              pay_link_id TEXT NOT NULL,
              wallet      TEXT NOT NULL,
              created_at  TEXT NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY (pay_link_id, wallet)
            );
            
            CREATE INDEX IF NOT EXISTS idx_allowlist_paylink ON pay_link_allowlist (pay_link_id);
            CREATE INDEX IF NOT EXISTS idx_allowlist_wallet  ON pay_link_allowlist (wallet);
            
            CREATE TABLE IF NOT EXISTS pay_links (
              id TEXT PRIMARY KEY,
              receive_asset_id TEXT NOT NULL,
              product_json TEXT NOT NULL,
              advanced_options_json TEXT NOT NULL,
              branding_json TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE INDEX IF NOT EXISTS idx_paylinks_created ON pay_links (created_at);

    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_merchant ON webhook_subscriptions (merchant_id);

    CREATE TABLE IF NOT EXISTS ping_links (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      amount_asset_id TEXT NOT NULL,
      amount_value TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      recipient_chain_id TEXT NOT NULL,
      theme_json TEXT,
      success_url TEXT,
      cancel_url TEXT,
      metadata TEXT,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ping_links_merchant_idem
      ON ping_links (merchant_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_ping_links_merchant ON ping_links (merchant_id);
    CREATE INDEX IF NOT EXISTS idx_ping_links_status ON ping_links (status);
            
            CREATE TABLE IF NOT EXISTS checkout_sessions (
              id TEXT PRIMARY KEY,
              merchant_id TEXT NOT NULL,
              amount_asset_id TEXT NOT NULL,
              amount_value TEXT NOT NULL,
              payer_address TEXT,
              payer_chain_id TEXT,
              recipient_address TEXT NOT NULL,
              recipient_chain_id TEXT NOT NULL,
              theme_json TEXT,
              success_url TEXT,
              cancel_url TEXT,
              status TEXT NOT NULL DEFAULT 'CREATED',
              payment_id TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              expires_at TEXT,
              metadata_json TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_checkout_sessions_merchant ON checkout_sessions (merchant_id);
            CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions (status);

            CREATE TABLE IF NOT EXISTS payments (
              id TEXT PRIMARY KEY,
              merchant_id TEXT NOT NULL,
              status TEXT NOT NULL,
              payer_address TEXT NOT NULL,
              payer_chain_id TEXT NOT NULL,
              recipient_address TEXT NOT NULL,
              recipient_chain_id TEXT NOT NULL,
              asset_id TEXT NOT NULL,
              amount_value TEXT NOT NULL,
              memo TEXT,
              idempotency_key TEXT NOT NULL,
              quote_total_fee TEXT,
              quote_asset_id TEXT,
              settlement_refs TEXT,
              metadata TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_merchant_idem
              ON payments (merchant_id, idempotency_key);
            CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments (merchant_id);
  `);
  
  // Add ext_status_id column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE quotes ADD COLUMN ext_status_id TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  try {
    db.exec(`ALTER TABLE quotes ADD COLUMN recipient TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  try {
    db.exec(`ALTER TABLE quotes ADD COLUMN refund_to TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Add theme and redirect URL columns to existing ping_links table if they don't exist
  try {
    db.exec(`ALTER TABLE ping_links ADD COLUMN theme_json TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  try {
    db.exec(`ALTER TABLE ping_links ADD COLUMN success_url TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  try {
    db.exec(`ALTER TABLE ping_links ADD COLUMN cancel_url TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  console.log('✅ Database migrated successfully');
}

export function dbCheck() {
  try {
    // Ensure the connection is usable
    db.pragma("foreign_keys = ON");

    // Quick integrity check (lightweight)
    const qc = db.prepare("PRAGMA quick_check;").all();
    const ok = Array.isArray(qc) && qc.length === 1 && qc[0].quick_check === "ok";

    // Tiny smoke query: count quotes table if it exists
    let quotesCount = null;
    const tableRow = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='quotes';"
    ).get();
    if (tableRow && tableRow.name === "quotes") {
      quotesCount = db.prepare("SELECT COUNT(1) AS n FROM quotes;").get().n;
    }

    // Count webhooks table if it exists
    let webhooksCount = null;
    const webhooksTableRow = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='webhooks';"
    ).get();
    if (webhooksTableRow && webhooksTableRow.name === "webhooks") {
      webhooksCount = db.prepare("SELECT COUNT(1) AS n FROM webhooks;").get().n;
    }

    return { ready: ok, quickCheck: ok ? "ok" : qc, quotesCount, webhooksCount };
  } catch (e) {
    return { ready: false, error: e.message || String(e) };
  }
}
