import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  getApiKeyUsage,
  ApiKeyNotFoundError,
  MerchantNotFoundError,
} from '../core/apiKeys/apiKeyService.ts';
import { ApiKeyUsageResponseSchema } from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const SECRET = 'secret-key-usage';
const API_KEY = 'sk_live_usage_keys';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function signRequest(method: string, path: string, body: object = {}) {
  const nonce = crypto.randomUUID();
  const serialized = JSON.stringify(body);
  const raw = `${nonce}${method}${path}${serialized}`;
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { nonce, signature, body: serialized };
}

function mockSecretKey(
  merchantId: string = 'merchant_usage',
  scopes: string[] = ['api-keys:read'],
  type: 'secret' | 'publishable' = 'secret',
) {
  const record = {
    id: `key_${merchantId}`,
    key: API_KEY,
    merchantId,
    scopes,
    revokedAt: null,
    type,
    secret: type === 'secret' ? SECRET : undefined,
  };
  vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
  return record;
}

describe('API Keys Usage API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('returns usage stats without filters', async () => {
    const merchant = mockSecretKey('merchant_usage_happy');
    const apiKeyId = 'key_usage_123';
    const usageSummary = {
      apiKeyId,
      merchantId: merchant.merchantId,
      totalRequests: 150,
      successCount: 145,
      errorCount: 5,
      firstSeenAt: new Date('2025-01-01T00:00:00.000Z'),
      lastSeenAt: new Date('2025-01-15T12:00:00.000Z'),
      byDay: [
        {
          date: new Date('2025-01-15'),
          totalRequests: 10,
          successCount: 9,
          errorCount: 1,
        },
        {
          date: new Date('2025-01-14'),
          totalRequests: 20,
          successCount: 20,
          errorCount: 0,
        },
      ],
    };

    vi.mocked(getApiKeyUsage).mockResolvedValue(usageSummary as any);

    const app = makeApp();
    const path = `/api/v1/api-keys/${apiKeyId}/usage`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(res.body.apiKeyId).toBe(apiKeyId);
    expect(res.body.merchantId).toBe(merchant.merchantId);
    expect(res.body.totalRequests).toBe(150);
    expect(res.body.successCount).toBe(145);
    expect(res.body.errorCount).toBe(5);
    expect(typeof res.body.firstSeenAt).toBe('string');
    expect(typeof res.body.lastSeenAt).toBe('string');
    expect(Array.isArray(res.body.byDay)).toBe(true);
    expect(res.body.byDay.length).toBe(2);
    expect(typeof res.body.byDay[0].date).toBe('string');
    expect(res.body.byDay[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    ApiKeyUsageResponseSchema.parse(res.body);
    expect(getApiKeyUsage).toHaveBeenCalledWith(merchant.merchantId, apiKeyId, {
      from: undefined,
      to: undefined,
      limitDays: undefined,
    });
  });

  it('returns usage stats with date filters', async () => {
    const merchant = mockSecretKey('merchant_usage_filters');
    const apiKeyId = 'key_usage_456';
    const fromDate = '2025-01-10T00:00:00.000Z';
    const toDate = '2025-01-20T23:59:59.999Z';
    const usageSummary = {
      apiKeyId,
      merchantId: merchant.merchantId,
      totalRequests: 75,
      successCount: 72,
      errorCount: 3,
      firstSeenAt: new Date('2025-01-10T00:00:00.000Z'),
      lastSeenAt: new Date('2025-01-20T12:00:00.000Z'),
      byDay: [
        {
          date: new Date('2025-01-20'),
          totalRequests: 5,
          successCount: 5,
          errorCount: 0,
        },
      ],
    };

    vi.mocked(getApiKeyUsage).mockResolvedValue(usageSummary as any);

    const app = makeApp();
    const query = new URLSearchParams({
      from: fromDate,
      to: toDate,
      limitDays: '30',
    }).toString();
    const path = `/api/v1/api-keys/${apiKeyId}/usage?${query}`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(`/api/v1/api-keys/${apiKeyId}/usage`)
      .query({ from: fromDate, to: toDate, limitDays: 30 })
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    ApiKeyUsageResponseSchema.parse(res.body);
    expect(getApiKeyUsage).toHaveBeenCalledWith(merchant.merchantId, apiKeyId, {
      from: new Date(fromDate),
      to: new Date(toDate),
      limitDays: 30,
    });
  });

  it('rejects usage request with publishable auth key', async () => {
    mockSecretKey('merchant_pub_auth', ['api-keys:read'], 'publishable');
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/usage';
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toContain('Secret API key required to view API key usage');
    expect(getApiKeyUsage).not.toHaveBeenCalled();
  });

  it('requires API key authentication', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/api-keys/key_123/usage');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid HMAC signature', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/usage';
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', 'invalid_signature');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('maps MerchantNotFoundError to 404', async () => {
    const merchant = mockSecretKey('merchant_missing');
    const apiKeyId = 'key_123';
    vi.mocked(getApiKeyUsage).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = `/api/v1/api-keys/${apiKeyId}/usage`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(getApiKeyUsage).toHaveBeenCalledWith(merchant.merchantId, apiKeyId, {
      from: undefined,
      to: undefined,
      limitDays: undefined,
    });
  });

  it('maps ApiKeyNotFoundError to 404', async () => {
    const merchant = mockSecretKey('merchant_key_notfound');
    const apiKeyId = 'nonexistent_key';
    vi.mocked(getApiKeyUsage).mockRejectedValue(new ApiKeyNotFoundError('API key not found'));

    const app = makeApp();
    const path = `/api/v1/api-keys/${apiKeyId}/usage`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('API key not found');
    expect(getApiKeyUsage).toHaveBeenCalledWith(merchant.merchantId, apiKeyId, {
      from: undefined,
      to: undefined,
      limitDays: undefined,
    });
  });

  it('validates response schema with ISO date strings', async () => {
    const merchant = mockSecretKey('merchant_schema');
    const apiKeyId = 'key_schema_test';
    const usageSummary = {
      apiKeyId,
      merchantId: merchant.merchantId,
      totalRequests: 50,
      successCount: 48,
      errorCount: 2,
      firstSeenAt: new Date('2025-01-01T00:00:00.000Z'),
      lastSeenAt: new Date('2025-01-15T12:00:00.000Z'),
      byDay: [
        {
          date: new Date('2025-01-15'),
          totalRequests: 10,
          successCount: 9,
          errorCount: 1,
        },
      ],
    };

    vi.mocked(getApiKeyUsage).mockResolvedValue(usageSummary as any);

    const app = makeApp();
    const path = `/api/v1/api-keys/${apiKeyId}/usage`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(typeof res.body.firstSeenAt).toBe('string');
    expect(typeof res.body.lastSeenAt).toBe('string');
    expect(res.body.firstSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof res.body.byDay[0].date).toBe('string');
    expect(res.body.byDay[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    ApiKeyUsageResponseSchema.parse(res.body);
  });

  it('handles usage summary without optional date fields', async () => {
    const merchant = mockSecretKey('merchant_no_dates');
    const apiKeyId = 'key_no_dates';
    const usageSummary = {
      apiKeyId,
      merchantId: merchant.merchantId,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      byDay: [],
    };

    vi.mocked(getApiKeyUsage).mockResolvedValue(usageSummary as any);

    const app = makeApp();
    const path = `/api/v1/api-keys/${apiKeyId}/usage`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(res.body.firstSeenAt).toBeUndefined();
    expect(res.body.lastSeenAt).toBeUndefined();
    expect(Array.isArray(res.body.byDay)).toBe(true);
    expect(res.body.byDay.length).toBe(0);
    ApiKeyUsageResponseSchema.parse(res.body);
  });

  it('validates limitDays query parameter', async () => {
    const merchant = mockSecretKey('merchant_limit');
    const apiKeyId = 'key_limit_test';
    const usageSummary = {
      apiKeyId,
      merchantId: merchant.merchantId,
      totalRequests: 10,
      successCount: 10,
      errorCount: 0,
      byDay: [],
    };

    vi.mocked(getApiKeyUsage).mockResolvedValue(usageSummary as any);

    const app = makeApp();
    const query = new URLSearchParams({ limitDays: '30' }).toString();
    const path = `/api/v1/api-keys/${apiKeyId}/usage?${query}`;
    const { nonce, signature } = signRequest('GET', path, {});

    const res = await request(app)
      .get(`/api/v1/api-keys/${apiKeyId}/usage`)
      .query({ limitDays: '30' })
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature);

    expect(res.status).toBe(200);
    expect(getApiKeyUsage).toHaveBeenCalledWith(merchant.merchantId, apiKeyId, {
      from: undefined,
      to: undefined,
      limitDays: 30,
    });
  });
});

