import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  listApiKeys,
  MerchantNotFoundError,
} from '../core/apiKeys/apiKeyService.ts';
import { ListApiKeysResponseSchema } from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const SECRET = 'secret-key';
const API_KEY = 'sk_live_api_keys';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function signRequest(method: string, path: string, body: string = '{}') {
  const nonce = crypto.randomUUID();
  const raw = `${nonce}${method}${path}${body}`;
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { nonce, signature };
}

function mockSecretKey(
  merchantId: string = 'merchant_api_keys',
  type: 'secret' | 'publishable' = 'secret',
) {
  const record = {
    id: `key_${merchantId}`,
    key: API_KEY,
    merchantId,
    scopes: ['api-keys:read'],
    revokedAt: null,
    type,
    secret: type === 'secret' ? SECRET : undefined,
  };
  vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
  return record;
}

describe('API Keys API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('returns api keys for the merchant', async () => {
    const merchant = mockSecretKey('merchant_a');
    const mockedResponse = [
      {
        id: 'key_1',
        merchantId: merchant.merchantId,
        label: 'Primary',
        type: 'secret',
        status: 'active',
        allowedOrigins: ['https://example.com'],
        scopes: ['payments:write'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: new Date('2025-02-01T00:00:00.000Z'),
      },
      {
        id: 'key_2',
        merchantId: merchant.merchantId,
        label: null,
        type: 'publishable',
        status: 'revoked',
        allowedOrigins: [],
        scopes: ['widget:read'],
        createdAt: '2025-03-01T00:00:00.000Z',
        revokedAt: '2025-03-10T00:00:00.000Z',
        lastUsedAt: null,
      },
    ];
    vi.mocked(listApiKeys).mockResolvedValue(mockedResponse as any);

    const app = makeApp();
    const path = '/api/v1/api-keys';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.every((item: any) => item.merchantId === merchant.merchantId)).toBe(true);
    ListApiKeysResponseSchema.parse(res.body);
  });

  it('does not leak other merchant keys', async () => {
    const merchant = mockSecretKey('merchant_a');
    vi.mocked(listApiKeys).mockResolvedValue([
      {
        id: 'key_1',
        merchantId: merchant.merchantId,
        type: 'secret',
        status: 'active',
        allowedOrigins: [],
        scopes: [],
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      },
    ] as any);

    const app = makeApp();
    const path = '/api/v1/api-keys';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith('merchant_a');
    expect(res.body.items[0].merchantId).toBe('merchant_a');
  });

  it('rejects publishable keys', async () => {
    mockSecretKey('merchant_pub', 'publishable');
    const app = makeApp();
    const path = '/api/v1/api-keys';
    const { nonce, signature } = signRequest('GET', path);

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/api-keys');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when API key invalid', async () => {
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(null);
    const app = makeApp();
    const path = '/api/v1/api-keys';
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
      .get('/api/v1/api-keys')
      .set('X-Ping-Api-Key', API_KEY);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_SIGNATURE');
  });

  it('returns 401 when signature invalid', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys';
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', 'deadbeef');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('maps MerchantNotFoundError to 404', async () => {
    mockSecretKey();
    vi.mocked(listApiKeys).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = '/api/v1/api-keys';
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


