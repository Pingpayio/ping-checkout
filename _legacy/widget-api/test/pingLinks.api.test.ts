import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import { db, migrate } from '../src/db/sqlite.js';
import * as pingLinkService from '../core/pingLinks/pingLinkService.ts';

const SECRET = 'secret-key';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function makeHmac(method: string, path: string, body: string, nonce: string) {
  const raw = nonce + method + path + body;
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

describe('Ping Links API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    migrate();
    db.exec('DELETE FROM ping_links');
  });

  function mockWriteApiKey(merchantId: string = 'merchant-pinglink') {
    const record = {
      id: 'key-pinglink-write',
      key: 'sk_pinglink_123',
      merchantId,
      scopes: ['ping-links:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  function mockReadApiKey(merchantId: string = 'merchant-pinglink-read') {
    const record = {
      id: 'key-pinglink-read',
      key: 'pk_pinglink_456',
      merchantId,
      scopes: ['ping-links:read'],
      revokedAt: null,
      type: 'publishable' as const,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  const baseRequest = {
    amount: { assetId: 'usdc.near', amount: '1000000' },
    recipient: { address: 'merchant.near', chainId: 'near:mainnet' },
    metadata: { orderId: '12345' },
  };

  const themeRequest = {
    ...baseRequest,
    theme: { brandColor: '#FF5733', logoUrl: 'https://example.com/logo.png' },
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  };

  describe('POST /ping-links', () => {
    it('creates ping link with valid middleware stack', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = {
        ...baseRequest,
        idempotencyKey,
      };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/ping-links', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/ping-links')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(res.status).toBe(201);
      expect(res.body.pingLink).toMatchObject({
        pingLinkId: expect.stringMatching(/^plink_/),
        status: 'ACTIVE',
        amount: body.amount,
        recipient: body.recipient,
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
        metadata: body.metadata,
      });
    });

    it('creates ping link with theme and redirect URLs', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = {
        ...themeRequest,
        idempotencyKey,
      };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/ping-links', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/ping-links')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(res.status).toBe(201);
      expect(res.body.pingLink).toMatchObject({
        pingLinkId: expect.stringMatching(/^plink_/),
        status: 'ACTIVE',
        amount: body.amount,
        recipient: body.recipient,
        theme: body.theme,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
        metadata: body.metadata,
      });

      const { n } = db.prepare('SELECT COUNT(1) AS n FROM ping_links').get();
      expect(n).toBe(1);
    });

    it('replays cached response for duplicate idempotency key', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = {
        ...baseRequest,
        idempotencyKey,
      };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/ping-links', bodyStr, nonce);

      const app = makeApp();
      const first = await request(app)
        .post('/api/v1/ping-links')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/ping-links')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
    });

    it('rejects invalid payloads', async () => {
      const apiKey = mockWriteApiKey();
      const nonce = crypto.randomUUID();
      const body = { bad: true };
      const bodyStr = JSON.stringify(body);
      const signature = makeHmac('POST', '/api/v1/ping-links', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/ping-links')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAMS');
    });

    it('rejects missing API key', async () => {
      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/ping-links')
        .send({
          ...baseRequest,
          idempotencyKey: crypto.randomUUID(),
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /ping-links/:pingLinkId', () => {
    async function seedPingLink(merchantId: string, idempotencyKey: string, withTheme = false) {
      const input = withTheme
        ? { ...themeRequest, idempotencyKey }
        : { ...baseRequest, idempotencyKey };
      const pingLink = await pingLinkService.createPingLink(merchantId, input);
      return pingLink;
    }

    it('returns ping link for same merchant', async () => {
      const merchantId = 'merchant-get-1';
      const pingLink = await seedPingLink(merchantId, crypto.randomUUID());
      const apiKey = mockReadApiKey(merchantId);
      const app = makeApp();

      const res = await request(app)
        .get(`/api/v1/ping-links/${pingLink.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(200);
      expect(res.body.pingLink.pingLinkId).toBe(pingLink.id);
      expect(res.body.pingLink.status).toBe('ACTIVE');
      expect(res.body.pingLink.amount).toEqual(baseRequest.amount);
      expect(res.body.pingLink.recipient).toEqual(baseRequest.recipient);
    });

    it('returns ping link with theme and redirect URLs', async () => {
      const merchantId = 'merchant-get-theme';
      const pingLink = await seedPingLink(merchantId, crypto.randomUUID(), true);
      const apiKey = mockReadApiKey(merchantId);
      const app = makeApp();

      const res = await request(app)
        .get(`/api/v1/ping-links/${pingLink.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(200);
      expect(res.body.pingLink.pingLinkId).toBe(pingLink.id);
      expect(res.body.pingLink.theme).toEqual(themeRequest.theme);
      expect(res.body.pingLink.successUrl).toBe(themeRequest.successUrl);
      expect(res.body.pingLink.cancelUrl).toBe(themeRequest.cancelUrl);
    });

    it('returns 404 for missing ping link', async () => {
      const apiKey = mockReadApiKey('merchant-get-2');
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/ping-links/plink_nonexistent')
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for ping link owned by different merchant', async () => {
      const pingLink = await seedPingLink('merchant-owner', crypto.randomUUID());
      const apiKey = mockReadApiKey('merchant-other');
      const app = makeApp();

      const res = await request(app)
        .get(`/api/v1/ping-links/${pingLink.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});

