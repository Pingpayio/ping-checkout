import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  listApiKeys,
  MerchantNotFoundError,
} from '../core/apiKeys/apiKeyService.ts';
import { ListApiKeysResponseSchema } from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const ADMIN_API_KEY = 'admin-secret-key-123';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('Admin API Keys List API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
  });

  it('returns API keys for specified merchant', async () => {
    const merchantId = 'merchant_admin_test';
    const mockApiKeys = [
      {
        id: 'key_1',
        merchantId,
        label: 'Key 1',
        type: 'secret' as const,
        status: 'active' as const,
        allowedOrigins: [],
        scopes: ['payments:write'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: null,
      },
      {
        id: 'key_2',
        merchantId,
        label: 'Key 2',
        type: 'publishable' as const,
        status: 'active' as const,
        allowedOrigins: ['https://example.com'],
        scopes: ['widget:read'],
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: new Date('2025-01-15T12:00:00.000Z'),
      },
    ];

    vi.mocked(listApiKeys).mockResolvedValue(mockApiKeys as any);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys?merchantId=${merchantId}`;

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].merchantId).toBe(merchantId);
    expect(res.body.items[1].merchantId).toBe(merchantId);
    expect(res.body.items[0].id).toBe('key_1');
    expect(res.body.items[1].id).toBe('key_2');
    ListApiKeysResponseSchema.parse(res.body);
    expect(listApiKeys).toHaveBeenCalledWith(merchantId);
  });

  it('maps MerchantNotFoundError to 404', async () => {
    const merchantId = 'nonexistent_merchant';
    vi.mocked(listApiKeys).mockRejectedValue(new MerchantNotFoundError('Merchant not found'));

    const app = makeApp();
    const path = `/api/v1/admin/api-keys?merchantId=${merchantId}`;

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Merchant not found');
    expect(listApiKeys).toHaveBeenCalledWith(merchantId);
  });

  it('returns 401 when admin API key is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys?merchantId=merchant_123';

    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it('returns 401 when admin API key is invalid', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys?merchantId=merchant_123';

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it('validates response schema with ISO date strings', async () => {
    const merchantId = 'merchant_schema_test';
    const mockApiKeys = [
      {
        id: 'key_schema',
        merchantId,
        label: 'Schema Test Key',
        type: 'secret' as const,
        status: 'active' as const,
        allowedOrigins: [],
        scopes: [],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: new Date('2025-01-10T00:00:00.000Z'),
        lastUsedAt: new Date('2025-01-15T12:00:00.000Z'),
      },
    ];

    vi.mocked(listApiKeys).mockResolvedValue(mockApiKeys as any);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys?merchantId=${merchantId}`;

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(200);
    expect(typeof res.body.items[0].createdAt).toBe('string');
    expect(typeof res.body.items[0].revokedAt).toBe('string');
    expect(typeof res.body.items[0].lastUsedAt).toBe('string');
    expect(res.body.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.items[0].revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.items[0].lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    ListApiKeysResponseSchema.parse(res.body);
  });

  it('returns 400 when merchantId is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it('returns 400 when merchantId is empty', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys?merchantId=';

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it('returns empty array when merchant has no API keys', async () => {
    const merchantId = 'merchant_no_keys';
    vi.mocked(listApiKeys).mockResolvedValue([]);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys?merchantId=${merchantId}`;

    const res = await request(app)
      .get(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(Array.isArray(res.body.items)).toBe(true);
    ListApiKeysResponseSchema.parse(res.body);
    expect(listApiKeys).toHaveBeenCalledWith(merchantId);
  });
});

