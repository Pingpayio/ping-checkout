import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import * as quoteService from '../core/quotes/quoteService.ts';

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

describe('Quotes API - POST /quotes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  const baseRequest = {
    payer: { address: 'payer.near', chainId: 'near:mainnet' },
    recipient: { address: 'merchant.near', chainId: 'near:mainnet' },
    asset: { assetId: 'nep141:usdc.near', amount: '100000' },
    idempotencyKey: crypto.randomUUID(),
  };

  function mockApiKey() {
    const record = {
      id: 'key-quote',
      key: 'sk_quote_123',
      merchantId: 'merchant-quote',
      scopes: ['quotes:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  it('creates a quote with full middleware stack', async () => {
    const apiKey = mockApiKey();
    const quoteMock = {
      id: 'quote_test',
      merchantId: 'merchant-quote',
      request: baseRequest,
      feeQuote: {
        totalFee: baseRequest.asset,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    vi.spyOn(quoteService, 'createQuote').mockResolvedValue(quoteMock);

    const body = baseRequest;
    const bodyStr = JSON.stringify(body);
    const nonce = crypto.randomUUID();
    const signature = makeHmac('POST', '/api/v1/quotes', bodyStr, nonce);
    const idempotencyKey = baseRequest.idempotencyKey;

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/quotes')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.quote.quoteId).toBe(quoteMock.id);
    expect(quoteService.createQuote).toHaveBeenCalledWith(
      'merchant-quote',
      body,
    );
  });

  it('replays cached response on duplicate idempotency key', async () => {
    const apiKey = mockApiKey();
    const quoteMock = {
      id: 'quote_dup',
      merchantId: 'merchant-quote',
      request: baseRequest,
      feeQuote: {
        totalFee: baseRequest.asset,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    vi.spyOn(quoteService, 'createQuote').mockResolvedValue(quoteMock);

    const body = baseRequest;
    const bodyStr = JSON.stringify(body);
    const nonce = crypto.randomUUID();
    const signature = makeHmac('POST', '/api/v1/quotes', bodyStr, nonce);
    const idempotencyKey = baseRequest.idempotencyKey;

    const app = makeApp();
    const first = await request(app)
      .post('/api/v1/quotes')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/quotes')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  it('rejects invalid payloads', async () => {
    const apiKey = mockApiKey();
    const body = { bad: true };
    const bodyStr = JSON.stringify(body);
    const nonce = crypto.randomUUID();
    const signature = makeHmac('POST', '/api/v1/quotes', bodyStr, nonce);

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/quotes')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
  });
});


