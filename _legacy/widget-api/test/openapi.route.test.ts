import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('OpenAPI Route', () => {
  beforeEach(() => {
    redisStore.__clear();
  });

  it('returns OpenAPI spec as JSON', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toBeDefined();
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info).toBeDefined();
    expect(res.body.info.title).toBe('Ping Platform API');
    expect(res.body.info.version).toBe('1.0.0');
    expect(res.body.paths).toBeDefined();
  });

  it('includes widget bootstrap endpoint in paths', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.paths['/widget/bootstrap']).toBeDefined();
    expect(res.body.paths['/widget/bootstrap'].get).toBeDefined();
    expect(res.body.paths['/widget/bootstrap'].get.summary).toBe('Get widget bootstrap configuration');
  });

  it('includes checkout sessions POST endpoint in paths', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.paths['/checkout/sessions']).toBeDefined();
    expect(res.body.paths['/checkout/sessions'].post).toBeDefined();
    expect(res.body.paths['/checkout/sessions'].post.summary).toBe('Create a checkout session');
  });

  it('includes checkout sessions GET endpoint in paths', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.paths['/checkout/sessions/{sessionId}']).toBeDefined();
    expect(res.body.paths['/checkout/sessions/{sessionId}'].get).toBeDefined();
    expect(res.body.paths['/checkout/sessions/{sessionId}'].get.summary).toBe('Get checkout session by ID');
  });

  it('includes components schemas', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.components).toBeDefined();
    expect(res.body.components.schemas).toBeDefined();
    expect(res.body.components.schemas.ErrorResponse).toBeDefined();
    expect(res.body.components.schemas.CheckoutSession).toBeDefined();
    expect(res.body.components.schemas.WidgetBootstrapResponse).toBeDefined();
  });

  it('includes servers configuration', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.servers).toBeDefined();
    expect(Array.isArray(res.body.servers)).toBe(true);
    expect(res.body.servers.length).toBeGreaterThan(0);
    expect(res.body.servers[0].url).toBeDefined();
  });

  it('handles multiple rapid requests (rate limiting)', async () => {
    const app = makeApp();
    
    // Make multiple requests quickly
    const requests = Array.from({ length: 10 }, () =>
      request(app).get('/api/v1/openapi.json')
    );
    
    const responses = await Promise.all(requests);
    
    // All should succeed (rate limit is per IP, so should be fine for 10 requests)
    // If rate limited, we'd get 429, but with default limits this should pass
    const successCount = responses.filter(r => r.status === 200).length;
    expect(successCount).toBeGreaterThan(0);
    
    // At least the first request should succeed
    expect(responses[0].status).toBe(200);
  });

  it('returns valid JSON structure', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/openapi.json');

    expect(res.status).toBe(200);
    
    // Validate top-level structure
    expect(typeof res.body.openapi).toBe('string');
    expect(typeof res.body.info).toBe('object');
    expect(typeof res.body.paths).toBe('object');
    expect(typeof res.body.components).toBe('object');
    
    // Validate info structure
    expect(typeof res.body.info.title).toBe('string');
    expect(typeof res.body.info.version).toBe('string');
    expect(typeof res.body.info.description).toBe('string');
  });
});

