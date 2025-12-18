CREATE TABLE `checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`amount_asset_id` text NOT NULL,
	`amount_value` text NOT NULL,
	`payer_address` text,
	`payer_chain_id` text,
	`recipient_address` text NOT NULL,
	`recipient_chain_id` text NOT NULL,
	`theme_json` text,
	`success_url` text,
	`cancel_url` text,
	`status` text DEFAULT 'CREATED' NOT NULL,
	`payment_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_checkout_sessions_merchant` ON `checkout_sessions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_checkout_sessions_status` ON `checkout_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`order_id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`tx_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_quote_id_unique` ON `orders` (`quote_id`);--> statement-breakpoint
CREATE TABLE `pay_link_allowlist` (
	`pay_link_id` text NOT NULL,
	`wallet` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_link_allowlist_pk` ON `pay_link_allowlist` (`pay_link_id`,`wallet`);--> statement-breakpoint
CREATE INDEX `idx_allowlist_paylink` ON `pay_link_allowlist` (`pay_link_id`);--> statement-breakpoint
CREATE INDEX `idx_allowlist_wallet` ON `pay_link_allowlist` (`wallet`);--> statement-breakpoint
CREATE TABLE `pay_links` (
	`id` text PRIMARY KEY NOT NULL,
	`receive_asset_id` text NOT NULL,
	`product_json` text NOT NULL,
	`advanced_options_json` text NOT NULL,
	`branding_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_paylinks_created` ON `pay_links` (`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`status` text NOT NULL,
	`payer_address` text NOT NULL,
	`payer_chain_id` text NOT NULL,
	`recipient_address` text NOT NULL,
	`recipient_chain_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`amount_value` text NOT NULL,
	`memo` text,
	`idempotency_key` text NOT NULL,
	`quote_total_fee` text,
	`quote_asset_id` text,
	`settlement_refs` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_merchant_idem` ON `payments` (`merchant_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_payments_merchant` ON `payments` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `ping_links` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`amount_asset_id` text NOT NULL,
	`amount_value` text NOT NULL,
	`recipient_address` text NOT NULL,
	`recipient_chain_id` text NOT NULL,
	`theme_json` text,
	`success_url` text,
	`cancel_url` text,
	`metadata` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ping_links_merchant_idem` ON `ping_links` (`merchant_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_ping_links_merchant` ON `ping_links` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `idx_ping_links_status` ON `ping_links` (`status`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`quote_id` text PRIMARY KEY NOT NULL,
	`pay_link_id` text NOT NULL,
	`origin_asset` text NOT NULL,
	`destination_asset` text NOT NULL,
	`amount` text NOT NULL,
	`chain_id` text NOT NULL,
	`expires_at` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`ext_status_id` text,
	`recipient` text NOT NULL,
	`refund_to` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`url` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_subscriptions_merchant` ON `webhook_subscriptions` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL,
	`signature` text,
	`processed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
