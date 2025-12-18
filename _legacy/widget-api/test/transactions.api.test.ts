import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import * as transactionService from '../core/transactions/transactionService.ts';

const SECRET = 'sk_secret_test';
const API_KEY = 'sk_live_transactions';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function mockSecretKey(merchantId: string = 'merchant_tx') {
  const record = {
    id: 'api-key-id',
    key: API_KEY,
    merchantId,
    scopes: ['transactions:read'],
    revokedAt: null,
    type: 'secret' as const,
    secret: SECRET,
  };
  vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
  return record;
}

function signRequest(method: string, path: string, body: string = '{}') {
  const nonce = crypto.randomUUID();
  const raw = `${nonce}${method}${path}${body}`;
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { nonce, signature };
}

describe('Transactions API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('returns paginated transactions without filters', async () => {
    const merchant = mockSecretKey();
    const listSpy = vi
      .spyOn(transactionService, 'listTransactions')
      .mockResolvedValue({
        items: [
          {
            id: 'txn_1',
            merchantId: merchant.merchantId,
            direction: 'INCOMING',
            amount: '100',
            currency: 'USDC',
            network: 'base-mainnet',
            sender: 'alice.near',
            recipient: 'merchant.near',
            fees: '1',
            status: 'COMPLETED',
            occurredAt: new Date().toISOString(),
          },
        ],
        nextCursor: 'cursor_2',
      });

    const app = makeApp();
    const path = '/api/v1/transactions';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toBe('cursor_2');
    expect(listSpy).toHaveBeenCalledWith(merchant.merchantId, {
      limit: 50,
    });
  });

  it('passes filters to core service', async () => {
    mockSecretKey();
    const listSpy = vi
      .spyOn(transactionService, 'listTransactions')
      .mockResolvedValue({ items: [], nextCursor: undefined });

    const app = makeApp();
    const query = new URLSearchParams({
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-02-01T00:00:00.000Z',
      direction: 'OUTGOING',
      currency: 'USDC',
      network: 'base-mainnet',
      limit: '25',
      cursor: 'cursor_1',
    }).toString();
    const path = `/api/v1/transactions?${query}`;
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get('/api/v1/transactions')
      .query({
        from: '2025-01-01T00:00:00.000Z',
        to: '2025-02-01T00:00:00.000Z',
        direction: 'OUTGOING',
        currency: 'USDC',
        network: 'base-mainnet',
        limit: '25',
        cursor: 'cursor_1',
      })
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(listSpy).toHaveBeenCalledTimes(1);
    const [, filters] = listSpy.mock.calls[0];
    expect(filters?.limit).toBe(25);
    expect(filters?.direction).toBe('OUTGOING');
    expect(filters?.currency).toBe('USDC');
    expect(filters?.network).toBe('base-mainnet');
    expect(filters?.cursor).toBe('cursor_1');
    expect(filters?.from).toEqual(new Date('2025-01-01T00:00:00.000Z'));
    expect(filters?.to).toEqual(new Date('2025-02-01T00:00:00.000Z'));
  });

  it('returns 400 for invalid query params', async () => {
    mockSecretKey();
    const app = makeApp();
    const query = new URLSearchParams({ from: 'invalid-date' }).toString();
    const path = `/api/v1/transactions?${query}`;
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get('/api/v1/transactions')
      .query({ from: 'invalid-date' })
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
  });

  it('returns 401 when API key missing', async () => {
    mockSecretKey();
    const app = makeApp();
    const res = await request(app).get('/api/v1/transactions');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when API key invalid', async () => {
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(null);
    const app = makeApp();
    const path = '/api/v1/transactions';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_API_KEY');
  });

  it('returns 401 when HMAC headers missing', async () => {
    mockSecretKey();
    const app = makeApp();

    const res = await request(app)
      .get('/api/v1/transactions')
      .set('X-Ping-Api-Key', API_KEY);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_SIGNATURE');
  });

  it('propagates core errors', async () => {
    mockSecretKey();
    vi.spyOn(transactionService, 'listTransactions').mockRejectedValue(
      Object.assign(new Error('MERCHANT_NOT_FOUND'), { code: 'MERCHANT_NOT_FOUND' }),
    );

    const app = makeApp();
    const path = '/api/v1/transactions';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});


