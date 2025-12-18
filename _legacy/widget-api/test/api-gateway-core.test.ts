import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';

const SECRET = 'secret-key';

function signRequest(method: string, path: string, body: string = '{}') {
  const nonce = crypto.randomUUID();
  const raw = nonce + method + path + body;
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { nonce, signature };
}

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('API Gateway Core Infrastructure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('returns 200 for health check', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('rejects missing API key', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/checkout/sessions');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('enforces scopes and HMAC signature', async () => {
    const record = {
      id: 'key-1',
      key: 'sk_live_123',
      merchantId: 'm1',
      scopes: ['sessions:write', 'sessions:read'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

    const app = makeApp();
    const payload = { amount: '100' };
    const nonce = 'abc123';
    const body = JSON.stringify(payload);
    const raw = nonce + 'POST' + '/api/v1/checkout/sessions' + body;
    const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

    const res = await request(app)
      .post('/api/v1/checkout/sessions')
      .set('X-Ping-Api-Key', record.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', 'abc-123')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
  });

  it('returns cached response for repeated idempotency key', async () => {
    const record = {
      id: 'key-2',
      key: 'sk_live_456',
      merchantId: 'm1',
      scopes: ['sessions:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);

    const app = makeApp();
    const payload = { amount: '10' };
    const nonce = 'nonce-1';
    const body = JSON.stringify(payload);
    const raw = nonce + 'POST' + '/api/v1/checkout/sessions' + body;
    const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

    const key = 'idem-1';

    const first = await request(app)
      .post('/api/v1/checkout/sessions')
      .set('X-Ping-Api-Key', record.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(400);

    const second = await request(app)
      .post('/api/v1/checkout/sessions')
      .set('X-Ping-Api-Key', record.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(second.status).toBe(first.status);
    expect(second.body.code).toBe('INVALID_PARAMS');
  });

  it('enforces per-key rate limits', async () => {
    const record = {
      id: 'key-3',
      key: 'sk_live_tx',
      merchantId: 'm1',
      scopes: ['transactions:read'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    const app = makeApp();

    for (let i = 0; i < 300; i += 1) {
      const path = '/api/v1/transactions';
      const { nonce, signature } = signRequest('GET', path);
      const res = await request(app)
        .get('/api/v1/transactions')
        .set('X-Ping-Api-Key', record.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature);
      expect(res.status).toBe(200);
    }

    const path = '/api/v1/transactions';
    const { nonce, signature } = signRequest('GET', path);
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('X-Ping-Api-Key', record.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});

