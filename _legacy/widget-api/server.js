import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Sanity log environment variables (masked)
console.info('[BOOT]', {
  PORT: process.env.PORT,
  INTENTS_BASE: process.env.NEAR_ONECLICK_BASE,
  HAS_KEY: Boolean(process.env.NEAR_ONECLICK_KEY)
});

console.log('[BOOT_8081]', { ts: Date.now(), buildTag: 'settlement-enforce-v3' });
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import crypto from 'node:crypto';   // <-- add this (static import)
import { intentsConfig } from './src/lib/intents.js';
// Legacy oneClickQuote (intentsClient.js) Removed - using new intents system
import { parseQuoteInput } from "./src/schemas/quoteInput.js";
import { intentsAvailable } from "./src/lib/featureFlags.js";
import { buildOneClickQuotePayload } from "./src/services/oneClickPayload.js";
import { getTokenDecimals, getTokens } from "./src/services/oneClickTokens.js";
import { toSmallestUnits } from "./src/lib/amounts.js";
import { migrate, dbCheck, db } from "./src/db/sqlite.js";
import { insertQuote, getQuote, setQuoteExtStatusId } from "./src/repos/quotes.js";
import { createOrderForQuote, getOrder, setOrderStatus, getOrderWithQuote } from "./src/repos/orders.js";
import { oneClickStatus } from "./src/services/intentsStatus.js";
import { verifyHmacBase64, sha256Base64 } from "./src/lib/webhooks.js";
import { oneClickExecute } from "./src/services/intentsExecute.js";
import { mapUpstreamStatus } from "./src/services/statusMap.js";
import { extractWebhookEvent } from "./src/services/intentsWebhookExtractor.js";
import { requireEligible } from "./src/services/gating.js";
import { getPayLinkById, createPayLink, updatePayLink, listPayLinks, getPayLinkConfig, deletePayLink } from "./src/repos/paylinks.js";
import { getAllowlistWallets } from "./src/repos/allowlist.js";
import { signState, verifyState } from "./src/lib/onramp/hmac.js";
import { backendPost, backendGet } from "./src/lib/onramp/backend.js";
import { buildZkp2pUrl } from "./src/lib/onramp/zkp2p.js";
import { verifySettlement } from "./src/lib/onramp/verifySettlement.js";
import { processIntentsSubmit } from "./src/services/intents/index.js";
import intentsRouter from "./src/routes/intents.js";
import tokensRouter from "./src/routes/tokens.js";

// Dynamically import the compiled API gateway router when available (production),
// otherwise fall back to the TypeScript source during local development.
let createApiGatewayRouter;
try {
  ({ createApiGatewayRouter } = await import("./dist/api-gateway/index.js"));
} catch (err) {
  console.error(
    "[API-GATEWAY] Compiled router not found. Did you run `npm run build`?",
    err,
  );
  throw err;
}

/** ---- Config ---- */
const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  publishableKey: process.env.PUBLISHABLE_KEY || '',
  // Support both ALLOWED_ORIGINS (new) and CORS_ORIGINS (legacy)
  corsOrigins: (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  webhookSecretBase64: process.env.WEBHOOK_SECRET_BASE64 || '',
};

const allowAll = config.corsOrigins.length === 0 || config.corsOrigins[0] === '*';

/** ---- Safe Logging Helper (redact secrets) ---- */
function safeLog(level, message, data = {}) {
  const redacted = { ...data };
  // Redact sensitive fields
  const sensitiveKeys = ['authorization', 'apiKey', 'NEAR_ONECLICK_KEY', 'WEBHOOK_SECRET', 'token', 'password', 'secret'];
  for (const key of sensitiveKeys) {
    if (redacted[key]) redacted[key] = '[REDACTED]';
    if (redacted[key.toLowerCase()]) redacted[key.toLowerCase()] = '[REDACTED]';
  }
  // Redact nested objects
  if (redacted.headers?.authorization) redacted.headers.authorization = '[REDACTED]';
  if (redacted.body?.apiKey) redacted.body.apiKey = '[REDACTED]';
  
  console[level](message, redacted);
}

/** ---- Simple in-memory store for intents (swap for Redis/DB in prod) ---- */ // NEW
const mem = new Map(); // key: paymentRef or idemKey -> record

/** ---- 1-Click client helpers ---- */ // NEW
const ONECLICK_BASE = process.env.NEAR_ONECLICK_BASE;
const ONECLICK_KEY  = process.env.NEAR_ONECLICK_KEY;
const PUBLIC_API    = process.env.PUBLIC_API_BASE_URL; // e.g., https://api.yourhost.com/api/v1
const INTENTS_WEBHOOK_SECRET = process.env.INTENTS_WEBHOOK_SECRET || '';

/** ---- Request validation schemas ---- */
function validatePrepareRequest(body) {
  const errors = [];
  
  // Required fields
  if (!body.amountFiat || typeof body.amountFiat !== 'string') {
    errors.push('amountFiat must be a string');
  }
  if (!body.fiatCurrency || typeof body.fiatCurrency !== 'string') {
    errors.push('fiatCurrency must be a string');
  }
  if (!body.payAsset || typeof body.payAsset !== 'string') {
    errors.push('payAsset must be a string');
  }
  if (!body.receiveAsset || typeof body.receiveAsset !== 'string') {
    errors.push('receiveAsset must be a string');
  }
  if (!body.chainId || typeof body.chainId !== 'string') {
    errors.push('chainId must be a string');
  }
  if (!body.merchantId || typeof body.merchantId !== 'string') {
    errors.push('merchantId must be a string');
  }
  
  // Optional fields validation
  if (body.payerWalletAddress && typeof body.payerWalletAddress !== 'string') {
    errors.push('payerWalletAddress must be a string if provided');
  }
  if (body.memo && typeof body.memo !== 'string') {
    errors.push('memo must be a string if provided');
  }
  
  // Format validation
  if (body.amountFiat && !/^\d+(\.\d{1,2})?$/.test(body.amountFiat)) {
    errors.push('amountFiat must be a valid decimal number (e.g., "49.99")');
  }
  if (body.fiatCurrency && !/^[A-Z]{3}$/.test(body.fiatCurrency)) {
    errors.push('fiatCurrency must be a 3-letter currency code (e.g., "USD")');
  }
  if (body.payAsset && !/^(near|evm):/.test(body.payAsset)) {
    errors.push('payAsset must start with "near:" or "evm:"');
  }
  if (body.receiveAsset && !/^(near|evm):/.test(body.receiveAsset)) {
    errors.push('receiveAsset must start with "near:" or "evm:"');
  }
  if (body.chainId && !/^(near|evm):/.test(body.chainId)) {
    errors.push('chainId must start with "near:" or "evm:"');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateStatusRequest(params) {
  const errors = [];
  
  if (!params.paymentRef || typeof params.paymentRef !== 'string') {
    errors.push('paymentRef must be a string');
  }
  if (params.paymentRef && !/^pay_[a-z0-9]+$/.test(params.paymentRef)) {
    errors.push('paymentRef must match format "pay_..."');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

async function oneClickCreateIntent(payload) {
  const { data } = await axios.post(`${ONECLICK_BASE}/intents`, payload, {
    headers: { Authorization: `Bearer ${ONECLICK_KEY}` },
    timeout: 15_000,
  });
  return data; // { intentId, quote:{...}, paymentRequest? }
}
async function oneClickFetchStatus(intentId) {
  const { data } = await axios.get(`${ONECLICK_BASE}/intents/${intentId}`, {
    headers: { Authorization: `Bearer ${ONECLICK_KEY}` },
    timeout: 10_000,
  });
  return data; // { status, txHashes?, settledAsset?, settledAmount? }
}
function verifyWebhookHmac(raw, sig, secret) {
  if (!secret) return true;
  try {
    const mac = crypto.createHmac('sha256', secret)
      .update(raw || '', 'utf8')
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(mac),
      Buffer.from((sig || ''), 'hex')
    );
  } catch {
    return false;
  }
}

/** ---- App + Security ---- */
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(morgan('combined'));

/** ---- Global API Rate Limiting ---- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' }
});
app.use('/api', apiLimiter);

/** ---- Global error handler ---- */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

/** ---- Static files (widget.js) ---- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use('/widget.js', express.static(join(__dirname, 'public', 'widget.js'), {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

/** ---- CORS ---- */
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests without Origin header (curl/postman)
    if (!origin) return cb(null, true);
    // Allow all origins if explicitly configured (dev only)
    if (allowAll) return cb(null, true);
    // Strict origin matching for production
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  credentials: true, // Enable credentials for authenticated requests
}));

/** ---- JSON body (also keeps raw body if you later want HMAC) ---- */
app.use(express.json({
  limit: '1mb',
  type: ['application/json', 'application/*+json'], // handles vendor JSON too
  verify: (req, _res, buf) => { req.rawBody = buf ? buf.toString('utf8') : undefined; }
}));

/** ---- URL-encoded body parser ---- */
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/** ---- Liveness / Readiness ---- */
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});

app.get('/readiness', async (_req, res) => {
  try {
    // Lightweight readiness. Expand later to ping provider/DB if needed.
    return res.status(200).json({ upstream: 'ok' });
  } catch (e) {
    console.error('READINESS_ERROR', e.code || '', e.message || e);
    return res.status(503).json({ upstream: 'down' });
  }
});

/** ---- Health ---- */
app.get('/api/v1/health', (_req, res) => {
  const intents = intentsConfig();
  const db = dbCheck();
  
  res.status(200).json({
    ok: true,
    service: "pingpay-widget-api",
    time: new Date().toISOString(),
    intents: {
      ready: intents.ready,
      baseUrl: intents.baseUrl, // safe to show
      env: intents.env || null
    },
    db: {
      ready: db.ready,
      quotesCount: db.quotesCount,
      webhooksCount: db.webhooksCount,
      quickCheck: db.quickCheck,
      error: db.error || null
    }
  });
});

/** ---- Dev Only: Header Echo ---- */
// dev only - useful for debugging what headers are being sent
app.post('/__echo', (req, res) => {
  const auth = req.get('authorization') || '';
  res.json({ 
    hasAuth: !!auth, 
    scheme: auth.split(' ')[0] || null, 
    tokenMasked: auth.split(' ')[1]?.slice(0,12)+'…' 
  });
});

/** Public: list available networks derived from live 1-Click tokens feed */
app.get('/api/getNetworks', async (_req, res) => {
  try {
    const data = await getTokens();
    const tokens = Array.isArray(data) ? data : (data.tokens || []);
    // Derive network ids from available fields; prefer explicit chainId, else map blockchain -> <chain>:mainnet
    const rawIds = tokens.map(t => t.chainId || t.chain || t.networkId || t.network || (t.blockchain ? `${t.blockchain}:mainnet` : null));
    const chainIds = Array.from(new Set(rawIds.filter(Boolean)));

    const nameFor = (id) => {
      if (!id) return 'Unknown';
      if (id.startsWith('near:')) return id.endsWith('testnet') ? 'NEAR Testnet' : 'NEAR Mainnet';
      return id;
    };

    // Build map for quick lookups
    const map = new Map();
    for (const id of chainIds) {
      map.set(id, { id, name: nameFor(id), iconUrl: null });
    }

    // Optional allowlist via env SUPPORTED_CHAIN_IDS (comma-separated)
    const allow = (process.env.SUPPORTED_CHAIN_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const result = [...map.values()]
      .filter(n => allow.length === 0 || allow.includes(n.id));

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: 'NETWORKS_UNAVAILABLE', message: err.message });
  }
});

/** Public: list cryptocurrencies for a given networkId (URL-encoded) */
app.get('/api/getCryptocurrenciesByNetworkId/:networkId', async (req, res) => {
  try {
    const rawId = req.params.networkId || '';
    const networkId = decodeURIComponent(rawId);
    const data = await getTokens();
    const tokens = Array.isArray(data) ? data : (data.tokens || []);

    // Helper to determine a token's chainId
    const tokenChainId = (t) => t.chainId || t.chain || t.networkId || t.network || (t.blockchain ? `${t.blockchain}:mainnet` : undefined);

    const filtered = tokens.filter(t => tokenChainId(t) === networkId);

    // Map to response contract
    const result = filtered.map(t => ({
      id: t.assetId || t.id || t.contractAddress || null,
      symbol: t.symbol || null,
      name: t.name || t.symbol || null,
      imageUrl: t.imageUrl || t.iconUrl || null
    })).filter(x => x.id);

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: 'CURRENCIES_UNAVAILABLE', message: err.message });
  }
});

/** ---- Simple auth gate for everything after this middleware ---- */
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!config.publishableKey || token === config.publishableKey) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

/** ---- Rate limit for quote ---- */
const quoteLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/** =========================================================================
 *  PUBLIC WIDGET FACADE (what the FE calls)
 *  ========================================================================= */


/** Quote endpoint (authoritative totals) - DEPRECATED */
app.post('/api/v1/quote', quoteLimiter, async (req, res) => {
  // Legacy endpoint - immediately return deprecation notice
  return res.status(410).json({
    success: false,
    error: "ENDPOINT_DEPRECATED",
    message: "This endpoint has been deprecated. Please use /api/v1/intents/quote instead.",
    redirect: "/api/v1/intents/quote"
  });
});

/** Quote read endpoint (dev-only) */
app.get('/api/v1/quotes/:id', (req, res) => {
  const q = getQuote(req.params.id);
  if (!q) return res.status(404).json({ error: "QUOTE_NOT_FOUND" });
  return res.json(q);
});

/** Order status endpoint */
app.get("/api/v1/orders/:orderId/status", (req, res) => {
  const o = getOrder(req.params.orderId);
  if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  return res.status(200).json({
    orderId: o.order_id,
    status: o.status,
    txId: o.tx_id || null
  });
});

/** Order refresh endpoint - advance status via 1-Click */
app.post("/api/v1/orders/:orderId/refresh", async (req, res) => {
  try {
    const { orderId } = req.params;
    const row = getOrderWithQuote(orderId);
    if (!row) return res.status(404).json({ error: "ORDER_NOT_FOUND" });

    // If expired locally, short-circuit
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      setOrderStatus(orderId, "EXPIRED");
      return res.status(200).json({ orderId, status: "expired", txId: null });
    }

    // Pick the best available identifier for the status API.
    // Prefer ext_status_id; if absent, fallback to the quote_id.
    const useExternal = Boolean(row.ext_status_id);
    const statusParams = useExternal
      ? { requestId: row.ext_status_id }
      : { requestId: row.quote_id };

    const st = await oneClickStatus(statusParams);

    const local = mapUpstreamStatus(st.status || st.state);
    if (local === "PAID") {
      const tx = st.txId || st.transactionHash || null;
      setOrderStatus(orderId, "PAID", tx);
      return res.status(200).json({ orderId, status: "paid", txId: tx });
    }
    if (local === "FAILED") {
      setOrderStatus(orderId, "FAILED");
      return res.status(200).json({ orderId, status: "failed", txId: null });
    }
    if (local === "EXPIRED") {
      setOrderStatus(orderId, "EXPIRED");
      return res.status(200).json({ orderId, status: "expired", txId: null });
    }

    return res.status(200).json({ orderId, status: "pending", txId: row.tx_id || null });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: "REFRESH_FAILED", message: err.message });
  }
});

/** Checkout confirm – creates order from quoteId and starts execution */
app.post("/api/v1/checkout/confirm", async (req, res) => {
  try {
    const { quoteId } = req.body || {};
    if (!quoteId) {
      return res.status(400).json({ error: "MISSING_QUOTE_ID", message: "quoteId is required" });
    }

    const q = getQuote(quoteId);
    if (!q) {
      return res.status(404).json({ error: "QUOTE_NOT_FOUND", message: "Quote not found" });
    }

    // Basic expiry check (if provided)
    if (q.expires_at && new Date(q.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "QUOTE_EXPIRED", message: "Quote expired" });
    }

    // Create or reuse order for this quote
    const orderId = createOrderForQuote(quoteId);

    // If Intents not configured, return pending (no-op)
    if (!intentsAvailable()) {
      return res.status(200).json({ orderId, status: "pending", quoteId });
    }

    // For now, simulate execution since /v0/execute endpoint doesn't exist
    // In production, this would call the actual 1-Click execute endpoint
    try {
      // Build execute payload from saved quote row (same shape as quote; dry=false)
      const execInput = {
        dryMode: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: q.origin_asset,
        destinationAsset: q.destination_asset,
        amountCrypto: q.amount,              // already smallest units
        depositType: "ORIGIN_CHAIN",
        refundType: "ORIGIN_CHAIN",
        recipientType: "DESTINATION_CHAIN",
        recipient: q.recipient,              // Use saved recipient address
        refundTo:  q.refund_to,              // Use saved refund address
        chainId:   q.chain_id
      };
      const payload = buildOneClickQuotePayload(execInput);

      // Try to kick off execution
      const ex = await oneClickExecute(payload);

      // Capture an external id usable by /status (whichever is present)
      const extId = ex.requestId || ex.statusId || ex.id || null;
      if (extId) setQuoteExtStatusId(quoteId, extId);
    } catch (execError) {
      // If execute fails (e.g., endpoint doesn't exist), simulate with mock ID
      console.log(`[checkout] Execute failed, using mock external ID: ${execError.message}`);
      const mockExtId = `mock_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setQuoteExtStatusId(quoteId, mockExtId);
    }

    // Return pending; your /refresh or webhook will advance it
    return res.status(200).json({ orderId, status: "pending", quoteId });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: "CONFIRM_FAILED", message: err.message });
  }
});

/** =========================================================================
 *  WEBHOOKS (NEAR 1-Click) - Raw body processing
 *  ========================================================================= */

function diag(res, payload) {
  if (process.env.NODE_ENV !== "production") {
    return res.status(200).json(payload);
  }
  return res.status(200).send("ok");
}

app.post("/api/v1/webhooks/intents",
  express.raw({ type: "*/*" }),
  (req, res) => {
    try {
      const secret = process.env.INTENTS_WEBHOOK_SECRET || "";
      const sig = req.headers["x-webhook-signature"];
      const raw = req.rawBody || req.body?.toString?.() || "";

      // record raw
      db.prepare(`INSERT INTO webhooks (source, payload, signature) VALUES (?, ?, ?)`)
        .run("NEAR_1CLICK", raw, String(sig || ""));

      // signature check
      const valid = verifyHmacBase64(raw, sig, secret);
      if (!valid && secret && sig) {
        return diag(res, { ok: true, reason: "INVALID_SIGNATURE", used: null, found: false, upstream: null, local: null, mutated: false });
      }

      // extraction
      console.log('[webhook] Raw body:', raw);
      console.log('[webhook] Raw body type:', typeof raw);
      console.log('[webhook] Raw body length:', raw.length);
      const evt = extractWebhookEvent(raw);
      console.log('[webhook] Extracted event:', evt);
      if (!evt.ok) {
        return diag(res, { ok: true, reason: evt.reason || "EXTRACT_FAIL", used: null, found: false, upstream: null, local: null, mutated: false });
      }

      // lookup
      let used = null;
      let row = null;
      if (evt.orderId) { row = getOrderWithQuote(evt.orderId); used = "orderId"; }
      if (!row && evt.quoteId) { 
        row = db.prepare(`
          SELECT o.order_id, o.status AS order_status, o.tx_id,
                 q.quote_id, q.expires_at
          FROM orders o JOIN quotes q ON q.quote_id = o.quote_id
          WHERE q.quote_id = ?
        `).get(evt.quoteId); 
        used = "quoteId"; 
      }
      if (!row) {
        return diag(res, { ok: true, reason: "ORDER_NOT_FOUND", used, found: false, upstream: evt.upstream || null, local: null, mutated: false });
      }

      // map
      const local = mapUpstreamStatus(evt.upstream);
      let mutated = false;

      if (local === "PAID") {
        setOrderStatus(row.order_id, "PAID", evt.txId || null);
        mutated = true;
        return diag(res, { ok: true, used, found: true, upstream: evt.upstream || null, local, mutated, txId: evt.txId || null });
      }
      if (local === "FAILED") {
        setOrderStatus(row.order_id, "FAILED", null);
        mutated = true;
        return diag(res, { ok: true, used, found: true, upstream: evt.upstream || null, local, mutated });
      }
      if (local === "EXPIRED") {
        setOrderStatus(row.order_id, "EXPIRED", null);
        mutated = true;
        return diag(res, { ok: true, used, found: true, upstream: evt.upstream || null, local, mutated });
      }

      return diag(res, { ok: true, used, found: true, upstream: evt.upstream || null, local, mutated });
    } catch (e) {
      return diag(res, { ok: true, reason: "HANDLER_ERROR", error: (e && e.message) || String(e), mutated: false });
    }
  }
);

/** =========================================================================
 *  INTENTS (NEAR 1-Click) PUBLIC FACADE
 *  ========================================================================= */

// Optional: specific rate limit for prepare (stricter than quote)
const intentsLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/v1/intents/prepare
 * Body: {
 *   amountFiat: "49.99", fiatCurrency: "USD",
 *   payAsset: "near:NEAR", receiveAsset: "evm:USDC",
 *   chainId: "near:mainnet",
 *   merchantId: "mch_xxx",
 *   payerWalletAddress?: "user.near",
 *   memo?: "optional"
 * }
 * Returns: { paymentRef, status: "PENDING", intentId, quote:{...}, paymentRequest? }
 */
app.post('/api/v1/intents/prepare', intentsLimiter, async (req, res) => {
  try {
    // Validate request schema
    const validation = validatePrepareRequest(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.errors 
      });
    }

    const {
      amountFiat, fiatCurrency, payAsset, receiveAsset, chainId, merchantId,
      payerWalletAddress, memo,
    } = req.body;

    // Idempotency: allow FE to send Idempotency-Key; else generate one here
    const idemKey = req.headers['idempotency-key'] || `idem_${Math.random().toString(36).slice(2)}`;
    const existing = mem.get(idemKey);
    if (existing) return res.status(200).json(existing.publicView);

    const paymentRef = `pay_${Math.random().toString(36).slice(2)}`;

    // Build 1-Click request
    const payload = {
      merchantId,
      paymentRef,
      amountFiat: String(amountFiat),
      fiatCurrency,
      payAsset,
      receiveAsset,
      chainId,
      payerWalletAddress,
      memo,
      callbacks: {
        webhook: `${PUBLIC_API}/intents/webhook`,
      },
    };

    const created = await oneClickCreateIntent(payload);
    // created => { intentId, quote:{ payAmount, payAsset, receiveAmount, receiveAsset, expiresAt }, paymentRequest? }

    const record = {
      paymentRef,
      idemKey,
      status: 'PENDING',
      oneClickId: created.intentId,
      createdAt: Date.now(),
      publicView: {
        paymentRef,
        status: 'PENDING',
        intentId: created.intentId,
        quote: created.quote,
        paymentRequest: created.paymentRequest,
      },
    };

    mem.set(idemKey, record);
    mem.set(paymentRef, record);
    res.setHeader('Idempotency-Key', idemKey);
    return res.status(201).json(record.publicView);
  } catch (e) {
    const status = e?.response?.status || 500;
    const msg = e?.response?.data || { error: 'Intent prepare failed' };
    return res.status(status).json(msg);
  }
});

/**
 * GET /api/v1/intents/status/:paymentRef
 * Returns: { paymentRef, status, intentId, txHashes?, settledAsset?, settledAmount? }
 */
app.get('/api/v1/intents/status/:paymentRef', async (req, res) => {
  try {
    // Validate request schema
    const validation = validateStatusRequest(req.params);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validation.errors 
      });
    }

    const ref = String(req.params.paymentRef);
    const record = mem.get(ref);
    if (!record) return res.status(404).json({ error: 'Unknown paymentRef' });

    const fresh = await oneClickFetchStatus(record.oneClickId);
    // fresh => { status: "PENDING|ROUTING|EXECUTING|SUCCESS|FAILED", ... }
    if (fresh.status && fresh.status !== record.status) {
      record.status = fresh.status;
      record.txHashes = fresh.txHashes || record.txHashes;
      record.settledAsset = fresh.settledAsset || record.settledAsset;
      record.settledAmount = fresh.settledAmount || record.settledAmount;
      mem.set(ref, record);
      if (record.idemKey) mem.set(record.idemKey, record);
    }

    return res.json({
      paymentRef: ref,
      status: record.status,
      intentId: record.oneClickId,
      txHashes: record.txHashes || [],
      settledAsset: record.settledAsset || null,
      settledAmount: record.settledAmount || null,
    });
  } catch (e) {
    const status = e?.response?.status || 500;
    const msg = e?.response?.data || { error: 'Status fetch failed' };
    return res.status(status).json(msg);
  }
});

/**
 * POST /api/v1/intents/webhook
 * Provider -> our backend (uses req.rawBody from your JSON middleware)
 */
app.post('/api/v1/intents/webhook', async (req, res) => {
  try {
    // Optional HMAC verify
    const sig = req.headers['x-intents-signature']; // provider-dependent
    const ok = verifyWebhookHmac(req.rawBody, sig, INTENTS_WEBHOOK_SECRET);
    if (!ok) return res.status(401).json({ error: 'Invalid signature' });

    const { intentId, status, txHashes, settledAsset, settledAmount } = req.body || {};
    if (!intentId || !status) return res.status(400).json({ error: 'Invalid webhook payload' });

    // Find by intentId
    const found = [...mem.values()].find(r => r.oneClickId === intentId);
    if (!found) return res.json({ ok: true });

    found.status = status;
    if (txHashes) found.txHashes = txHashes;
    if (settledAsset) found.settledAsset = settledAsset;
    if (settledAmount) found.settledAmount = settledAmount;

    mem.set(found.paymentRef, found);
    if (found.idemKey) mem.set(found.idemKey, found);

    // TODO: also mark the associated Pay Link/order as Paid in your DB here

    return res.json({ ok: true });
  } catch (_e) {
    return res.status(400).json({ error: 'Bad webhook' });
  }
});

// Intents Submit endpoint moved to intents router

// Mount API Gateway router (includes OpenAPI, checkout, payments, api-keys, admin, etc.)
app.use('/api/v1', createApiGatewayRouter());

// Mount intents router (clean namespace separation)
app.use('/api/v1/intents', intentsRouter);

// Mount tokens router (pass-through to 1-Click API)
app.use(tokensRouter);

// Pay Link CRUD endpoints
app.post('/api/v1/pay-links', async (req, res) => {
  try {
    const payLink = createPayLink(req.body);
    res.status(201).json(payLink);
  } catch (error) {
    console.error('[pay-links] Create failed:', error.message);
    res.status(400).json({ 
      error: 'VALIDATION_ERROR', 
      message: error.message 
    });
  }
});

app.get('/api/v1/pay-links/:id', async (req, res) => {
  try {
    const payLink = getPayLinkById(req.params.id);
    if (!payLink) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'Pay link not found' 
      });
    }
    res.json(payLink);
  } catch (error) {
    console.error('[pay-links] Get failed:', error.message);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Failed to retrieve pay link' 
    });
  }
});

app.patch('/api/v1/pay-links/:id', async (req, res) => {
  try {
    const payLink = updatePayLink(req.params.id, req.body);
    if (!payLink) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'Pay link not found' 
      });
    }
    res.json(payLink);
  } catch (error) {
    console.error('[pay-links] Update failed:', error.message);
    res.status(400).json({ 
      error: 'VALIDATION_ERROR', 
      message: error.message 
    });
  }
});

app.get('/api/v1/pay-links/:id/config', async (req, res) => {
  try {
    const config = await getPayLinkConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'Pay link not found' 
      });
    }
    res.json(config);
  } catch (error) {
    console.error('[pay-links] Config failed:', error.message);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Failed to retrieve pay link config' 
    });
  }
});

app.get('/api/v1/pay-links', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const payLinks = listPayLinks({ 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json(payLinks);
  } catch (error) {
    console.error('[pay-links] List failed:', error.message);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Failed to list pay links' 
    });
  }
});

app.delete('/api/v1/pay-links/:id', async (req, res) => {
  try {
    const deleted = deletePayLink(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'Pay link not found' 
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('[pay-links] Delete failed:', error.message);
    res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Failed to delete pay link' 
    });
  }
});

/** =========================================================================
 *  ONRAMP ENDPOINTS
 *  ========================================================================= */

// Rate limiting middleware for currency rate endpoint
const rateLimitCurrencyRate = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // Simple in-memory rate limiting (10 requests per minute per IP for both OPTIONS and POST)
  if (!global.rateLimit) global.rateLimit = {};
  if (!global.rateLimit[clientIP]) global.rateLimit[clientIP] = { count: 0, resetTime: now + 60000 };
  
  if (now > global.rateLimit[clientIP].resetTime) {
    global.rateLimit[clientIP] = { count: 0, resetTime: now + 60000 };
  }
  
  if (global.rateLimit[clientIP].count >= 10) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.'
    });
  }
  
  global.rateLimit[clientIP].count++;
  next();
};

// Currency rate endpoint for PingPay Onramp SDK
app.options('/api/v1/currency_rate', (req, res) => {
  res.status(204).end();
});

app.post('/api/v1/currency_rate', async (req, res) => {
  try {
    const { currencyIn, currencyOut, amountIn, apiKey } = req.body;
    
    if (!currencyIn || !currencyOut || !amountIn) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'currencyIn, currencyOut, and amountIn are required'
      });
    }

    // Validate API key (in production, this would be more secure)
    const validApiKey = process.env.PING_ONRAMP_API_KEY;
    if (validApiKey && apiKey && apiKey !== validApiKey) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'Invalid API key'
      });
    }

    // For now, return a mock exchange rate
    // In production, this would call Ping Payments API or a real exchange rate service
    const mockRate = 0.000024; // Example: 1 USD = 0.000024 wNEAR
    
    const convertedAmount = parseFloat(amountIn) * mockRate;
    
    res.json({
      currencyIn,
      currencyOut,
      amountIn: parseFloat(amountIn),
      amountOut: convertedAmount,
      rate: mockRate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[currency_rate] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get currency rate'
    });
  }
});

// Onramp quote endpoint with schema normalizer
app.post('/api/v1/onramp/quote', async (req, res) => {
  try {
    const body = req.body;
    
    // Normalize request schema - accept both formats
    let normalizedParams;
    const missingFields = [];
    
    // Check for provider schema (purchase_*)
    if (body.purchase_amount && body.purchase_currency && body.purchase_network) {
      normalizedParams = {
        provider: body.provider || 'zkp2p',
        purchase_amount: body.purchase_amount,
        purchase_currency: body.purchase_currency,
        purchase_network: body.purchase_network,
        payment_currency: body.payment_currency || 'USD',
        payment_method: body.payment_method || 'p2p',
        country: body.country || 'GB',
        apiKey: body.apiKey
      };
    }
    // Check for internal schema (from/to/amount)
    else if (body.amount && body.fromCurrency && body.toCurrency) {
      normalizedParams = {
        provider: body.provider || 'zkp2p',
        purchase_amount: body.amount,
        purchase_currency: body.toCurrency,
        purchase_network: body.network || 'near:mainnet',
        payment_currency: body.fromCurrency,
        payment_method: body.paymentMethod || 'p2p',
        country: body.country || 'GB',
        apiKey: body.apiKey
      };
    }
    // Neither schema found - determine missing fields
    else {
      if (!body.purchase_amount && !body.amount) missingFields.push('amount/purchase_amount');
      if (!body.purchase_currency && !body.toCurrency) missingFields.push('toCurrency/purchase_currency');
      if (!body.purchase_network && !body.network) missingFields.push('network/purchase_network');
      if (!body.fromCurrency && !body.payment_currency) missingFields.push('fromCurrency/payment_currency');
      
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'Required fields missing',
        fields: missingFields
      });
    }

    // Validate API key
    const validApiKey = process.env.PING_ONRAMP_API_KEY;
    if (validApiKey && normalizedParams.apiKey && normalizedParams.apiKey !== validApiKey) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'Invalid API key'
      });
    }

    // Mock onramp quote - in production, call Ping Payments API
    const quoteId = `onramp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockRate = 0.000024;
    const convertedAmount = parseFloat(normalizedParams.purchase_amount) * mockRate;
    
    res.json({
      quoteId,
      provider: normalizedParams.provider,
      purchase_amount: normalizedParams.purchase_amount,
      purchase_currency: normalizedParams.purchase_currency,
      purchase_network: normalizedParams.purchase_network,
      payment_currency: normalizedParams.payment_currency,
      payment_method: normalizedParams.payment_method,
      country: normalizedParams.country,
      fromAmount: parseFloat(normalizedParams.purchase_amount),
      toAmount: convertedAmount,
      rate: mockRate,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      fees: {
        onramp: parseFloat(normalizedParams.purchase_amount) * 0.01, // 1% fee
        network: 0.001 // Fixed network fee
      }
    });
  } catch (error) {
    console.error('[onramp/quote] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create onramp quote'
    });
  }
});

// Onramp initiate endpoint
app.post('/api/v1/onramp/initiate', async (req, res) => {
  try {
    const { quoteId, userInfo, apiKey } = req.body;
    
    if (!quoteId) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'quoteId is required'
      });
    }

    // Validate API key
    const validApiKey = process.env.PING_ONRAMP_API_KEY;
    if (validApiKey && apiKey && apiKey !== validApiKey) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'Invalid API key'
      });
    }

    // Mock onramp initiation - in production, call Ping Payments API
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      transactionId,
      quoteId,
      status: 'PENDING',
      redirectUrl: `http://localhost:5173/onramp?txn=${transactionId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
    });
  } catch (error) {
    console.error('[onramp/initiate] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to initiate onramp transaction'
    });
  }
});

// Onramp status endpoint
app.get('/api/v1/onramp/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Mock status check - in production, call Ping Payments API
    res.json({
      transactionId,
      status: 'PENDING', // PENDING, COMPLETED, FAILED, EXPIRED
      progress: 50,
      message: 'Transaction in progress'
    });
  } catch (error) {
    console.error('[onramp/status] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to check onramp status'
    });
  }
});

// Blockchain networks endpoint for widget
app.get('/api/v1/getAllBlockchainNetworks', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataPath = path.join(__dirname, 'data', 'blockchain_networks.json');
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('[getAllBlockchainNetworks] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get blockchain networks'
    });
  }
});

// Cryptocurrencies by network endpoint for widget
app.get('/api/v1/getCryptocurrenciesByNetworkId/:networkId', async (req, res) => {
  try {
    const { networkId } = req.params;
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataPath = path.join(__dirname, 'data', 'cryptocurrencies_by_network.json');
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const cryptocurrencies = data[networkId] || [];
    
    res.json(cryptocurrencies);
  } catch (error) {
    console.error('[getCryptocurrenciesByNetworkId] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get cryptocurrencies for network'
    });
  }
});

// Widget-API: Onramp init endpoint (creates order and returns ZKP2P redirect URL)
app.post('/api/onramp/init', async (req, res) => {
  try {
    const {
      orderId,
      payLinkId,
      amountFiat,
      fiatCurrency = "USD",
      destinationNetworkId,
      destinationTokenId,
      recipientAddress,
      userOriginEvm
    } = req.body;

    // Validate required fields
    if (!orderId || !payLinkId || !amountFiat || !destinationNetworkId || !destinationTokenId || !recipientAddress || !userOriginEvm) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'orderId, payLinkId, amountFiat, destinationNetworkId, destinationTokenId, recipientAddress, and userOriginEvm are required'
      });
    }

    // Validate fiat currency
    if (!['USD', 'GBP', 'EUR'].includes(fiatCurrency)) {
      return res.status(400).json({
        error: 'INVALID_CURRENCY',
        message: 'fiatCurrency must be USD, GBP, or EUR'
      });
    }

    // Validate EVM address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userOriginEvm)) {
      return res.status(400).json({
        error: 'INVALID_EVM_ADDRESS',
        message: 'userOriginEvm must be a valid 40-character hex address'
      });
    }

    // Get idempotency key
    const idemKey = req.headers['idempotency-key'] || orderId;

    // 1) Ensure order exists server-side
    await backendPost('/internal/orders/init', {
      orderId,
      provider: 'zkp2p',
      fiatCurrency,
      fiatAmount: amountFiat,
      toToken: destinationTokenId,
      recipientAddress,
    });

    // 2) Save expectations + nonce
    const nonce = crypto.randomUUID();
    await backendPost('/internal/orders/expectations', {
      orderId,
      nonce,
      toToken: destinationTokenId,
      recipientAddress,
    });

    // 3) Sign state for callback
    const state = signState({ orderId, nonce, ts: Date.now() });
    const callbackUrl = `${process.env.PUBLIC_API_BASE}/api/onramp/zkp2p/callback?state=${encodeURIComponent(state)}`;

    // 4) Build redirect URL to ZKP2P
    const redirectUrl = buildZkp2pUrl({
      referrer: "PingPay",
      referrerLogo: "https://pingpay.io/logo.svg",
      callbackUrl,
      inputCurrency: fiatCurrency,
      inputAmount: amountFiat,
      toToken: `${destinationNetworkId}:${destinationTokenId}`, // e.g. "near:usdc.near"
      recipientAddress,
      // amountUsdc: String(amountFiat) // uncomment if you want exact-out USDC
    });

    res.json({ redirectUrl, idempotencyKey: idemKey });

  } catch (error) {
    console.error('[onramp/init] Failed:', error.message);
    res.status(400).json({
      error: 'INIT_FAILED',
      reason: error.message
    });
  }
});

// Widget-API: Onramp callback endpoint (verifies on-chain settlement)
app.get('/api/onramp/zkp2p/callback', async (req, res) => {
  try {
    const state = req.query.state || "";
    
    if (!state) {
      return res.status(400).json({
        error: 'MISSING_STATE',
        message: 'State parameter is required'
      });
    }

    // 1) Verify HMAC state
    const { orderId } = verifyState(String(state), 30 * 60 * 1000, process.env.PING_HMAC_SECRET);
    
    console.log(`[onramp/callback] Verifying order: ${orderId}`);

    // 2) Get order expectations from backend
    const expectations = await backendGet(`/internal/orders/${orderId}/expectations`);
    
    // 3) On-chain verification
    const result = await verifySettlement({
      networkId: expectations.networkId || "base",
      tokenAddress: expectations.toToken,
      to: expectations.recipientAddress,
      minAmount: expectations.minAmountOut || "0"
    });

    if (result?.txHash) {
      // 4) Mark order as paid
      await backendPost(`/internal/orders/${orderId}/mark-paid`, {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        amountReceived: result.amountReceived
      });
      
      console.log(`[onramp/callback] Order ${orderId} marked as paid: ${result.txHash}`);
      return res.json({ 
        status: "paid", 
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        amountReceived: result.amountReceived
      });
    }

    console.log(`[onramp/callback] Order ${orderId} still processing - no settlement found`);
    return res.json({ status: "processing" });

  } catch (error) {
    console.error('[onramp/callback] Failed:', error.message);
    return res.status(400).json({
      error: 'CALLBACK_INVALID',
      reason: error.message
    });
  }
});

// Internal endpoints for Widget-API communication
app.post('/internal/orders/init', async (req, res) => {
  try {
    const { orderId, provider, fiatCurrency, fiatAmount, toToken, recipientAddress } = req.body;
    
    console.log('[internal/orders/init] Creating order:', { orderId, provider, fiatCurrency, fiatAmount, toToken, recipientAddress });
    
    // For now, just log the order creation
    // In production, this would create/update the order in the database
    
    res.json({ orderId, status: 'PENDING' });
  } catch (error) {
    console.error('[internal/orders/init] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to initialize order'
    });
  }
});

app.post('/internal/orders/expectations', async (req, res) => {
  try {
    const { orderId, nonce, toToken, recipientAddress } = req.body;
    
    console.log('[internal/orders/expectations] Saving expectations:', { orderId, nonce, toToken, recipientAddress });
    
    // For now, just log the expectations
    // In production, this would save the expectations in the database
    
    res.json({ orderId, nonce, toToken, recipientAddress, saved: true });
  } catch (error) {
    console.error('[internal/orders/expectations] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to save order expectations'
    });
  }
});

app.get('/internal/orders/:orderId/expectations', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('[internal/orders/expectations] Getting expectations for:', orderId);
    
    // For now, return mock expectations
    // In production, this would fetch from the database
    res.json({
      orderId,
      toToken: "usdc.base",
      recipientAddress: "0x1234567890123456789012345678901234567890",
      networkId: "base",
      minAmountOut: "0"
    });
  } catch (error) {
    console.error('[internal/orders/expectations] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get order expectations'
    });
  }
});

app.post('/internal/orders/:orderId/mark-paid', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { txHash, blockNumber, amountReceived } = req.body;
    
    console.log('[internal/orders/mark-paid] Marking order as paid:', { orderId, txHash, blockNumber, amountReceived });
    
    // For now, just log the payment
    // In production, this would update the order status in the database
    
    res.json({ orderId, status: 'PAID', txHash, blockNumber, amountReceived });
  } catch (error) {
    console.error('[internal/orders/mark-paid] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to mark order as paid'
    });
  }
});

// Onramp callback endpoint (for Ping Payments webhooks)
app.post('/api/v1/onramp/callback', async (req, res) => {
  try {
    const { transactionId, status, amount, currency } = req.body;
    
    console.log('[onramp/callback] Received:', { transactionId, status, amount, currency });
    
    // In production, verify webhook signature from Ping Payments
    // For now, just log the callback
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[onramp/callback] Failed:', error.message);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to process onramp callback'
    });
  }
});

/** =========================================================================
 *  OPTIONAL DIAGNOSTIC (kept for completeness)
 *  ========================================================================= */
app.get('/v1/merchant/profile', (req, res) => {
  const merchantId = String(req.query.merchantId || '');
  if (!merchantId) return res.status(400).json({ error: 'merchantId required' });
  res.json({ name: `Merchant ${merchantId.slice(0, 6)}`, logoUrl: '', verified: true });
});

/** ---- Start ---- */
// Initialize database on startup
migrate();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`PingPay backend listening on :${config.port}`);
});

// Set server timeouts for production safety
server.headersTimeout = 65_000; // 65 seconds
server.requestTimeout = 60_000;  // 60 seconds

export default app;