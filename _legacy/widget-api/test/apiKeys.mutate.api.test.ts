import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
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

const SECRET = 'secret-key-mutate';
const API_KEY = 'sk_live_mutate_keys';

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
  merchantId: string = 'merchant_mutate',
  scopes: string[] = ['api-keys:write'],
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

describe('API Keys Regenerate API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('regenerates a secret API key successfully', async () => {
    const merchant = mockSecretKey('merchant_regenerate');
    const keyId = 'key_to_regenerate';
    const regeneratedKey = {
      id: keyId,
      merchantId: merchant.merchantId,
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
    const path = `/api/v1/api-keys/${keyId}/regenerate`;
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.apiKey.id).toBe(keyId);
    expect(res.body.apiKey.merchantId).toBe(merchant.merchantId);
    expect(res.body.plainTextKey).toBe(plainTextKey);
    expect(res.body.plainTextKey).toMatch(/^sk_/);
    RegenerateApiKeyResponseSchema.parse(res.body);
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('regenerates a publishable API key successfully', async () => {
    const merchant = mockSecretKey('merchant_regenerate_pub');
    const keyId = 'key_pub_to_regenerate';
    const regeneratedKey = {
      id: keyId,
      merchantId: merchant.merchantId,
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
    const path = `/api/v1/api-keys/${keyId}/regenerate`;
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.plainTextKey).toMatch(/^pk_/);
    RegenerateApiKeyResponseSchema.parse(res.body);
  });

  it('rejects regenerate with publishable auth key', async () => {
    mockSecretKey('merchant_pub_auth', ['api-keys:write'], 'publishable');
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/regenerate';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toContain('Secret API key required to manage API keys');
    expect(regenerateApiKey).not.toHaveBeenCalled();
  });

  it('returns 404 when key not found', async () => {
    const merchant = mockSecretKey('merchant_notfound');
    vi.mocked(regenerateApiKey).mockRejectedValue(new ApiKeyNotFoundError('API key not found'));

    const app = makeApp();
    const path = '/api/v1/api-keys/nonexistent/regenerate';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('API key not found');
    expect(regenerateApiKey).toHaveBeenCalledWith({ keyId: 'nonexistent' });
  });

  it('returns 400 when key is revoked', async () => {
    const merchant = mockSecretKey('merchant_revoked');
    vi.mocked(regenerateApiKey).mockRejectedValue(
      new ApiKeyRevokedError('Cannot regenerate a revoked key'),
    );

    const app = makeApp();
    const path = '/api/v1/api-keys/revoked_key/regenerate';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('API_KEY_REVOKED');
    expect(res.body.message).toContain('API key is revoked');
  });

  it('requires API key authentication', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/api-keys/key_123/regenerate').send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid HMAC signature', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/regenerate';
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', 'invalid_signature')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('maps MerchantNotFoundError to 404', async () => {
    mockSecretKey('merchant_missing');
    vi.mocked(regenerateApiKey).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/regenerate';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('API Keys Revoke API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('revokes an active API key successfully', async () => {
    const merchant = mockSecretKey('merchant_revoke');
    const keyId = 'key_to_revoke';
    const revokedKey = {
      id: keyId,
      merchantId: merchant.merchantId,
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
    const path = `/api/v1/api-keys/${keyId}/revoke`;
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.apiKey.id).toBe(keyId);
    expect(res.body.apiKey.status).toBe('revoked');
    expect(res.body.apiKey.merchantId).toBe(merchant.merchantId);
    expect(res.body.apiKey.revokedAt).toBeDefined();
    RevokeApiKeyResponseSchema.parse(res.body);
    expect(revokeApiKey).toHaveBeenCalledWith({ keyId });
  });

  it('is idempotent - revoking twice returns revoked key', async () => {
    const merchant = mockSecretKey('merchant_idempotent');
    const keyId = 'key_already_revoked';
    const alreadyRevokedKey = {
      id: keyId,
      merchantId: merchant.merchantId,
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
    const path = `/api/v1/api-keys/${keyId}/revoke`;
    const { nonce, signature } = signRequest('POST', path, {});

    // First revoke
    const res1 = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res1.status).toBe(200);
    expect(res1.body.apiKey.status).toBe('revoked');

    // Second revoke (idempotent)
    const { nonce: nonce2, signature: signature2 } = signRequest('POST', path, {});
    const res2 = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce2)
      .set('X-Ping-Signature', signature2)
      .send({});

    expect(res2.status).toBe(200);
    expect(res2.body.apiKey.status).toBe('revoked');
    expect(revokeApiKey).toHaveBeenCalledTimes(2);
  });

  it('rejects revoke with publishable auth key', async () => {
    mockSecretKey('merchant_pub_auth', ['api-keys:write'], 'publishable');
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/revoke';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toContain('Secret API key required to manage API keys');
    expect(revokeApiKey).not.toHaveBeenCalled();
  });

  it('returns 404 when key not found', async () => {
    const merchant = mockSecretKey('merchant_notfound_revoke');
    vi.mocked(revokeApiKey).mockRejectedValue(new ApiKeyNotFoundError('API key not found'));

    const app = makeApp();
    const path = '/api/v1/api-keys/nonexistent/revoke';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('API key not found');
    expect(revokeApiKey).toHaveBeenCalledWith({ keyId: 'nonexistent' });
  });

  it('requires API key authentication', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/api-keys/key_123/revoke').send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid HMAC signature', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/revoke';
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', 'invalid_signature')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('maps MerchantNotFoundError to 404', async () => {
    mockSecretKey('merchant_missing_revoke');
    vi.mocked(revokeApiKey).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = '/api/v1/api-keys/key_123/revoke';
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('validates response schema with ISO date strings', async () => {
    const merchant = mockSecretKey('merchant_schema');
    const keyId = 'key_schema_test';
    const revokedKey = {
      id: keyId,
      merchantId: merchant.merchantId,
      label: 'Schema Test',
      type: 'secret' as const,
      status: 'revoked' as const,
      allowedOrigins: [],
      scopes: [],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      revokedAt: new Date('2025-01-15T00:00:00.000Z'),
      lastUsedAt: new Date('2025-01-14T12:00:00.000Z'),
    };

    vi.mocked(revokeApiKey).mockResolvedValue(revokedKey as any);

    const app = makeApp();
    const path = `/api/v1/api-keys/${keyId}/revoke`;
    const { nonce, signature } = signRequest('POST', path, {});

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send({});

    expect(res.status).toBe(200);
    expect(typeof res.body.apiKey.createdAt).toBe('string');
    expect(typeof res.body.apiKey.revokedAt).toBe('string');
    expect(typeof res.body.apiKey.lastUsedAt).toBe('string');
    expect(res.body.apiKey.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    RevokeApiKeyResponseSchema.parse(res.body);
  });
});

