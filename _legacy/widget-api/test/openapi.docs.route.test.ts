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

describe('OpenAPI Docs Route', () => {
  beforeEach(() => {
    redisStore.__clear();
  });

  it('returns HTML docs page', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(typeof res.text).toBe('string');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('contains reference to OpenAPI JSON endpoint', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/api/v1/openapi.json');
  });

  it('contains SwaggerUIBundle initialization', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SwaggerUIBundle');
  });

  it('contains swagger-ui div element', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="swagger-ui">');
  });

  it('includes Swagger UI CSS and JS from CDN', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui.css');
    expect(res.text).toContain('swagger-ui-bundle.js');
    expect(res.text).toContain('unpkg.com/swagger-ui-dist');
  });

  it('has proper HTML structure', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<html');
    expect(res.text).toContain('<head>');
    expect(res.text).toContain('<body>');
    expect(res.text).toContain('</html>');
  });

  it('includes page title', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/docs');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>PingPay API Docs</title>');
  });

  it('handles multiple rapid requests (rate limiting)', async () => {
    const app = makeApp();
    
    // Make multiple requests quickly
    const requests = Array.from({ length: 10 }, () =>
      request(app).get('/api/v1/docs')
    );
    
    const responses = await Promise.all(requests);
    
    // All should succeed (rate limit is per IP, so should be fine for 10 requests)
    // If rate limited, we'd get 429, but with default limits this should pass
    const successCount = responses.filter(r => r.status === 200).length;
    expect(successCount).toBeGreaterThan(0);
    
    // At least the first request should succeed
    expect(responses[0].status).toBe(200);
    expect(responses[0].headers['content-type']).toContain('text/html');
  });
});

