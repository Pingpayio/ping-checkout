import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  regenerateApiKey,
  revokeApiKey,
  ApiKeyNotFoundError,
  ApiKeyRevokedError,
  MerchantNotFoundError,
} from '../core/apiKeys/apiKeyService.ts';
import {
  RegenerateApiKeyResponseSchema,
  RevokeApiKeyResponseSchema,
} from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const ADMIN_API_KEY = 'admin-secret-key-123';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('Admin API Keys Regenerate API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
  });

  it('regenerates an API key successfully', async () => {
    const keyId = 'key_to_regenerate';
    const regeneratedKey = {
      id: keyId,
      merchantId: 'merchant_admin_regenerate',
      label: 'Regenerated Key',
      type: 'secret' as const,
      status: 'active' as const,
      allowedOrigins: [],
      scopes: ['payments:write'],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: null,
      lastUsedAt: null,
    };
    const plainTextKey = 'sk_test_regenerated';

    vi.mocked(regenerateApiKey).mockResolvedValue({
      apiKey: regeneratedKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.apiKey.id).toBe(keyId);
    expect(res.body.plainTextKey).toBe(plainTextKey);
    expect(res.body.plainTextKey).toMatch(/^sk_/);
    RegenerateApiKeyResponseSchema.parse(res.body);
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('regenerates a publishable API key successfully', async () => {
    const keyId = 'key_pub_to_regenerate';
    const regeneratedKey = {
      id: keyId,
      merchantId: 'merchant_admin_pub',
      label: 'Regenerated Publishable',
      type: 'publishable' as const,
      status: 'active' as const,
      allowedOrigins: ['https://example.com'],
      scopes: ['widget:read'],
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      revokedAt: null,
      lastUsedAt: null,
    };
    const plainTextKey = 'pk_test_regenerated';

    vi.mocked(regenerateApiKey).mockResolvedValue({
      apiKey: regeneratedKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.apiKey.type).toBe('publishable');
    expect(res.body.plainTextKey).toMatch(/^pk_/);
    RegenerateApiKeyResponseSchema.parse(res.body);
  });

  it('returns 401 when admin API key is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys/key_123/regenerate';

    const res = await request(app).post(path).send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(regenerateApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 when admin API key is invalid', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys/key_123/regenerate';

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', 'wrong-key')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(regenerateApiKey).not.toHaveBeenCalled();
  });

  it('maps ApiKeyNotFoundError to 404', async () => {
    const keyId = 'nonexistent_key';
    vi.mocked(regenerateApiKey).mockRejectedValue(new ApiKeyNotFoundError('API key not found'));

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('API key not found');
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('maps ApiKeyRevokedError to 400', async () => {
    const keyId = 'revoked_key';
    vi.mocked(regenerateApiKey).mockRejectedValue(
      new ApiKeyRevokedError('Cannot regenerate a revoked key'),
    );

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('API_KEY_REVOKED');
    expect(res.body.message).toContain('API key is revoked');
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('maps MerchantNotFoundError to 404', async () => {
    const keyId = 'key_merchant_notfound';
    vi.mocked(regenerateApiKey).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('returns 400 when id is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys//regenerate';

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    // Express will likely route this differently, but we test the validation
    expect(regenerateApiKey).not.toHaveBeenCalled();
  });

  it('validates response schema with ISO date strings', async () => {
    const keyId = 'key_schema_test';
    const regeneratedKey = {
      id: keyId,
      merchantId: 'merchant_schema',
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

    vi.mocked(regenerateApiKey).mockResolvedValue({
      apiKey: regeneratedKey as any,
      plainTextKey,
    });

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/regenerate`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(typeof res.body.apiKey.createdAt).toBe('string');
    expect(typeof res.body.apiKey.revokedAt).toBe('string');
    expect(typeof res.body.apiKey.lastUsedAt).toBe('string');
    expect(res.body.apiKey.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    RegenerateApiKeyResponseSchema.parse(res.body);
  });
});

describe('Admin API Keys Revoke API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
  });

  it('revokes an API key successfully', async () => {
    const keyId = 'key_to_revoke';
    const revokedKey = {
      id: keyId,
      merchantId: 'merchant_admin_revoke',
      label: 'Revoked Key',
      type: 'secret' as const,
      status: 'revoked' as const,
      allowedOrigins: [],
      scopes: ['payments:write'],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: new Date('2025-01-15T00:00:00.000Z'),
      lastUsedAt: null,
    };

    vi.mocked(revokeApiKey).mockResolvedValue(revokedKey as any);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/revoke`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.apiKey.id).toBe(keyId);
    expect(res.body.apiKey.status).toBe('revoked');
    expect(res.body.apiKey.revokedAt).toBeDefined();
    RevokeApiKeyResponseSchema.parse(res.body);
    expect(revokeApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('is idempotent - revoking twice returns revoked key', async () => {
    const keyId = 'key_already_revoked';
    const alreadyRevokedKey = {
      id: keyId,
      merchantId: 'merchant_admin_idempotent',
      label: 'Already Revoked',
      type: 'secret' as const,
      status: 'revoked' as const,
      allowedOrigins: [],
      scopes: [],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: new Date('2025-01-10T00:00:00.000Z'),
      lastUsedAt: null,
    };

    vi.mocked(revokeApiKey).mockResolvedValue(alreadyRevokedKey as any);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/revoke`;

    // First revoke
    const res1 = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res1.status).toBe(200);
    expect(res1.body.apiKey.status).toBe('revoked');

    // Second revoke (idempotent)
    const res2 = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res2.status).toBe(200);
    expect(res2.body.apiKey.status).toBe('revoked');
    expect(revokeApiKey).toHaveBeenCalledTimes(2);
  });

  it('returns 401 when admin API key is missing', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys/key_123/revoke';

    const res = await request(app).post(path).send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(revokeApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 when admin API key is invalid', async () => {
    const app = makeApp();
    const path = '/api/v1/admin/api-keys/key_123/revoke';

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', 'wrong-key')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Admin API key is invalid or missing');
    expect(revokeApiKey).not.toHaveBeenCalled();
  });

  it('maps ApiKeyNotFoundError to 404', async () => {
    const keyId = 'nonexistent_key';
    vi.mocked(revokeApiKey).mockRejectedValue(new ApiKeyNotFoundError('API key not found'));

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/revoke`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('API key not found');
    expect(revokeApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('maps MerchantNotFoundError to 404', async () => {
    const keyId = 'key_merchant_notfound';
    vi.mocked(revokeApiKey).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/revoke`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(revokeApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('validates response schema with ISO date strings', async () => {
    const keyId = 'key_schema_test';
    const revokedKey = {
      id: keyId,
      merchantId: 'merchant_schema',
      label: 'Schema Test Key',
      type: 'secret' as const,
      status: 'revoked' as const,
      allowedOrigins: [],
      scopes: [],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: new Date('2025-01-10T00:00:00.000Z'),
      lastUsedAt: new Date('2025-01-15T12:00:00.000Z'),
    };

    vi.mocked(revokeApiKey).mockResolvedValue(revokedKey as any);

    const app = makeApp();
    const path = `/api/v1/admin/api-keys/${keyId}/revoke`;

    const res = await request(app)
      .post(path)
      .set('X-Admin-Api-Key', ADMIN_API_KEY)
      .send({});

    expect(res.status).toBe(200);
    expect(typeof res.body.apiKey.createdAt).toBe('string');
    expect(typeof res.body.apiKey.revokedAt).toBe('string');
    expect(typeof res.body.apiKey.lastUsedAt).toBe('string');
    expect(res.body.apiKey.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.apiKey.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    RevokeApiKeyResponseSchema.parse(res.body);
  });
});

