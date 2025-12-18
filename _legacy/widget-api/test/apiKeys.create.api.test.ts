import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import {
  createApiKey,
  MerchantNotFoundError,
  InvalidApiKeyConfigError,
} from '../core/apiKeys/apiKeyService.ts';
import { CreateApiKeyResponseSchema } from '../api-gateway/schemas/apiKeySchemas.ts';

vi.mock('../core/apiKeys/apiKeyService.ts');

const SECRET = 'secret-key';
const API_KEY = 'sk_live_create_keys';

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
  merchantId: string = 'merchant_create_keys',
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

describe('API Keys Create API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  it('creates a secret API key', async () => {
    const merchant = mockSecretKey();
    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: {
        id: 'key_new_secret',
        merchantId: merchant.merchantId,
        label: 'Server Key',
        type: 'secret',
        status: 'active',
        allowedOrigins: [],
        scopes: ['payments:write'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: null,
      },
      plainTextKey: 'sk_test_new',
    } as any);

    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = { label: 'Server Key', type: 'secret', scopes: ['payments:write'] };
    const { nonce, signature, body } = signRequest('POST', path, payload);

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.apiKey.merchantId).toBe(merchant.merchantId);
    expect(res.body.plainTextKey).toMatch(/^sk_/);
    CreateApiKeyResponseSchema.parse(res.body);
    expect(createApiKey).toHaveBeenCalledWith({
      merchantId: merchant.merchantId,
      label: 'Server Key',
      type: 'secret',
      allowedOrigins: undefined,
      scopes: ['payments:write'],
    });
  });

  it('creates a publishable key with allowed origins', async () => {
    const merchant = mockSecretKey();
    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: {
        id: 'key_new_publishable',
        merchantId: merchant.merchantId,
        label: 'Widget',
        type: 'publishable',
        status: 'active',
        allowedOrigins: ['https://example.com'],
        scopes: [],
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      },
      plainTextKey: 'pk_live_new',
    } as any);

    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = {
      label: 'Widget',
      type: 'publishable',
      allowedOrigins: ['https://example.com'],
    };
    const { nonce, signature } = signRequest('POST', path, payload);

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.plainTextKey).toMatch(/^pk_/);
    expect(res.body.apiKey.allowedOrigins).toEqual(['https://example.com']);
    CreateApiKeyResponseSchema.parse(res.body);
  });

  it('requires allowedOrigins for publishable keys', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = { type: 'publishable' };
    const { nonce, signature } = signRequest('POST', path, payload);

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_API_KEY_CONFIG');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('rejects publishable auth keys', async () => {
    mockSecretKey('merchant_pub_auth', ['api-keys:write'], 'publishable');
    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = { type: 'secret' };
    const { nonce, signature } = signRequest('POST', path, payload);

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('requires API key authentication', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/api-keys').send({ type: 'secret' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid signatures', async () => {
    mockSecretKey();
    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = { type: 'secret' };
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', 'deadbeef')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('maps MerchantNotFoundError to 404', async () => {
    mockSecretKey();
    vi.mocked(createApiKey).mockRejectedValue(new MerchantNotFoundError());

    const app = makeApp();
    const path = '/api/v1/api-keys';
    const payload = { type: 'secret' };
    const { nonce, signature } = signRequest('POST', path, payload);

    const res = await request(app)
      .post(path)
      .set('X-Ping-Api-Key', API_KEY)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});


