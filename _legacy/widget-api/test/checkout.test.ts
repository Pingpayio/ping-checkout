// test/checkout.test.ts
import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import { createCheckoutSession, getCheckoutSessionById } from '../src/services/checkout/checkoutService.js';
import { db } from '../src/db/sqlite.js';
import { migrate } from '../src/db/sqlite.js';

const SECRET = 'secret-key';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function makeHmac(nonce: string, method: string, path: string, body: string): string {
  const raw = nonce + method + path + body;
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

describe('Checkout Sessions API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    // Ensure migration has run
    migrate();
    // Reset database
    try {
      db.exec('DELETE FROM checkout_sessions');
    } catch (e) {
      // Table might not exist yet, migration will create it
    }
  });

  describe('POST /checkout/sessions', () => {
    const validBody = {
      amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
      recipient: { address: 'merchant.near', chainId: 'near' },
      theme: { brandColor: '#FF0000' },
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    it('creates session with valid API key + HMAC + idempotency', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:write'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      const nonce = crypto.randomUUID();
      const bodyStr = JSON.stringify(validBody);
      const signature = makeHmac(nonce, 'POST', '/api/v1/checkout/sessions', bodyStr);
      const idempotencyKey = crypto.randomUUID();

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/checkout/sessions')
        .set('X-Ping-Api-Key', 'sk_live_123')
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.session).toMatchObject({
        sessionId: expect.stringMatching(/^cs_/),
        status: 'CREATED',
        amount: validBody.amount,
        recipient: validBody.recipient,
      });
      expect(res.body.sessionUrl).toMatch(/^https:\/\/pay\.pingpay\.io\/checkout\/cs_/);

      // Verify idempotency
      const cached = await redisStore.get(`idemp:${idempotencyKey}`);
      expect(cached).toBeTruthy();
      const cachedData = JSON.parse(cached!);
      expect(cachedData.statusCode).toBe(201);
    });

    it('replays same response for duplicate idempotency key', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:write'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      const nonce = crypto.randomUUID();
      const bodyStr = JSON.stringify(validBody);
      const signature = makeHmac(nonce, 'POST', '/api/v1/checkout/sessions', bodyStr);
      const idempotencyKey = crypto.randomUUID();

      // Store cached response
      await redisStore.setex(
        `idemp:${idempotencyKey}`,
        86400,
        JSON.stringify({
          statusCode: 201,
          body: { session: { sessionId: 'cs_cached', status: 'CREATED' }, sessionUrl: 'https://pay.pingpay.io/checkout/cs_cached' },
        })
      );

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/checkout/sessions')
        .set('X-Ping-Api-Key', 'sk_live_123')
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.session.sessionId).toBe('cs_cached');
    });

    it('rejects missing idempotency key', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:write'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      const nonce = crypto.randomUUID();
      const bodyStr = JSON.stringify(validBody);
      const signature = makeHmac(nonce, 'POST', '/api/v1/checkout/sessions', bodyStr);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/checkout/sessions')
        .set('X-Ping-Api-Key', 'sk_live_123')
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('rejects invalid payload', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:write'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      const nonce = crypto.randomUUID();
      const invalidBody = { amount: { assetId: '' } }; // missing required fields
      const bodyStr = JSON.stringify(invalidBody);
      const signature = makeHmac(nonce, 'POST', '/api/v1/checkout/sessions', bodyStr);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/checkout/sessions')
        .set('X-Ping-Api-Key', 'sk_live_123')
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(invalidBody);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAMS');
    });
  });

  describe('GET /checkout/sessions/:sessionId', () => {
    it('returns session for correct merchant', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:read'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      // Create a session directly
      const session = await createCheckoutSession({
        merchantId: 'merchant-1',
        amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
        recipient: { address: 'merchant.near', chainId: 'near' },
      });

      const app = makeApp();
      const res = await request(app)
        .get(`/api/v1/checkout/sessions/${session.id}`)
        .set('X-Ping-Api-Key', 'sk_live_123');

      expect(res.status).toBe(200);
      expect(res.body.session.sessionId).toBe(session.id);
      expect(res.body.session.status).toBe('CREATED');
    });

    it('returns 404 if session not found', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:read'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      const app = makeApp();
      const res = await request(app)
        .get('/api/v1/checkout/sessions/cs_nonexistent')
        .set('X-Ping-Api-Key', 'sk_live_123');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 if session belongs to another merchant', async () => {
      const record = {
        id: 'key-1',
        key: 'sk_live_123',
        merchantId: 'merchant-1',
        scopes: ['sessions:read'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

      // Create session for different merchant
      const session = await createCheckoutSession({
        merchantId: 'merchant-2',
        amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
        recipient: { address: 'merchant.near', chainId: 'near' },
      });

      const app = makeApp();
      const res = await request(app)
        .get(`/api/v1/checkout/sessions/${session.id}`)
        .set('X-Ping-Api-Key', 'sk_live_123');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Core Service', () => {
    it('createCheckoutSession inserts record with status CREATED', async () => {
      const session = await createCheckoutSession({
        merchantId: 'merchant-1',
        amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
        recipient: { address: 'merchant.near', chainId: 'near' },
      });

      expect(session.id).toMatch(/^cs_/);
      expect(session.status).toBe('CREATED');
      expect(session.merchantId).toBe('merchant-1');
      expect(session.amount).toEqual({ assetId: 'nep141:usdc.near', amount: '1000000' });
      expect(session.recipient).toEqual({ address: 'merchant.near', chainId: 'near' });
      expect(session.expiresAt).toBeTruthy();

      // Verify in DB
      const found = await getCheckoutSessionById('merchant-1', session.id);
      expect(found).toBeTruthy();
      expect(found?.status).toBe('CREATED');
    });

    it('getCheckoutSessionById returns session for correct merchant', async () => {
      const session = await createCheckoutSession({
        merchantId: 'merchant-1',
        amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
        recipient: { address: 'merchant.near', chainId: 'near' },
      });

      const found = await getCheckoutSessionById('merchant-1', session.id);
      expect(found).toBeTruthy();
      expect(found?.id).toBe(session.id);
    });

    it('getCheckoutSessionById returns null for another merchant', async () => {
      const session = await createCheckoutSession({
        merchantId: 'merchant-1',
        amount: { assetId: 'nep141:usdc.near', amount: '1000000' },
        recipient: { address: 'merchant.near', chainId: 'near' },
      });

      const found = await getCheckoutSessionById('merchant-2', session.id);
      expect(found).toBeNull();
    });

    it('getCheckoutSessionById returns null for missing id', async () => {
      const found = await getCheckoutSessionById('merchant-1', 'cs_nonexistent');
      expect(found).toBeNull();
    });
  });
});

