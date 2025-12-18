import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  createApiKey,
  MerchantNotFoundError,
  InvalidApiKeyConfigError,
} from '../core/apiKeys/apiKeyService.ts';
import { CreateApiKeyResponseSchema } from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const ADMIN_API_KEY = 'admin-secret-key-123';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('Admin API Keys Create API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
  });

  it('creates a secret API key for a merchant', async () => {
    const merchantId = 'merchant_admin_create';
    const newApiKey = {
      id: 'key_new_secret',
      merchantId,
      label: 'Admin Created Secret Key',
      type: 'secret' as const,
      status: 'active' as const,
      allowedOrigins: [],
      scopes: ['payments:write'],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: null,
      lastUsedAt: null,
    };
    const plainTextKey = 'sk_test_admin_created';

    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: newApiKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId,
      label: 'Admin Created Secret Key',
      type: 'secret',
      scopes: ['payments:write'],
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.apiKey.merchantId).toBe(merchantId);
    expect(res.body.apiKey.id).toBe('key_new_secret');
    expect(res.body.plainTextKey).toBe(plainTextKey);
    expect(res.body.plainTextKey).toMatch(/^sk_/);
    CreateApiKeyResponseSchema.parse(res.body);
    expect(createApiKey).toHaveBeenCalledWith({
      merchantId,
      label: body.label,
      type: body.type,
      allowedOrigins: undefined,
      scopes: body.scopes,
    });
  });

  it('creates a publishable API key with allowed origins', async () => {
    const merchantId = 'merchant_admin_publishable';
    const newApiKey = {
      id: 'key_new_publishable',
      merchantId,
      label: 'Admin Created Publishable Key',
      type: 'publishable' as const,
      status: 'active' as const,
      allowedOrigins: ['https://example.com', 'https://widget.example.com'],
      scopes: ['widget:read'],
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      revokedAt: null,
      lastUsedAt: null,
    };
    const plainTextKey = 'pk_test_admin_created';

    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: newApiKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId,
      label: 'Admin Created Publishable Key',
      type: 'publishable',
      allowedOrigins: ['https://example.com', 'https://widget.example.com'],
      scopes: ['widget:read'],
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.apiKey.type).toBe('publishable');
    expect(res.body.plainTextKey).toMatch(/^pk_/);
    expect(res.body.apiKey.allowedOrigins).toEqual(body.allowedOrigins);
    CreateApiKeyResponseSchema.parse(res.body);
    expect(createApiKey).toHaveBeenCalledWith({
      merchantId,
      label: body.label,
      type: body.type,
      allowedOrigins: body.allowedOrigins,
      scopes: body.scopes,
    });
  });

  it('returns 400 when allowedOrigins is missing for publishable key', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId: 'merchant_test',
      type: 'publishable',
      scopes: ['widget:read'],
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_API_KEY_CONFIG');
    expect(res.body.message).toContain('allowedOrigins must be provided for publishable keys');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('returns 400 when allowedOrigins is empty array for publishable key', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId: 'merchant_test',
      type: 'publishable',
      allowedOrigins: [],
      scopes: ['widget:read'],
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_API_KEY_CONFIG');
    expect(res.body.message).toContain('allowedOrigins must be provided for publishable keys');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 when admin API key is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId: 'merchant_test',
      type: 'secret',
    };

    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 when admin API key is invalid', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId: 'merchant_test',
      type: 'secret',
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', 'wrong-key')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('maps MerchantNotFoundError to 404', async () => {
    const merchantId = 'nonexistent_merchant';
    vi.mocked(createApiKey).mockRejectedValue(new MerchantNotFoundError('Merchant not found'));

    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId,
      type: 'secret',
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Merchant not found');
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId }),
    );
  });

  it('maps InvalidApiKeyConfigError to 400', async () => {
    const merchantId = 'merchant_invalid_config';
    vi.mocked(createApiKey).mockRejectedValue(
      new InvalidApiKeyConfigError('Invalid scope provided'),
    );

    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId,
      type: 'secret',
      scopes: ['invalid:scope'],
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_API_KEY_CONFIG');
    expect(res.body.message).toBeDefined();
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId }),
    );
  });

  it('validates response schema with ISO date strings', async () => {
    const merchantId = 'merchant_schema_test';
    const newApiKey = {
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
    };
    const plainTextKey = 'sk_test_schema';

    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: newApiKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId,
      type: 'secret',
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(201);
    expect(typeof res.body.apiKey.createdAt).toBe('string');
    expect(typeof res.body.apiKey.revokedAt).toBe('string');
    expect(typeof res.body.apiKey.lastUsedAt).toBe('string');
    expect(res.body.apiKey.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    CreateApiKeyResponseSchema.parse(res.body);
  });

  it('returns 400 when merchantId is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      type: 'secret',
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('returns 400 when merchantId is empty', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys';
    const body = {
      merchantId: '',
      type: 'secret',
    };

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
    expect(createApiKey).not.toHaveBeenCalled();
  });
});

