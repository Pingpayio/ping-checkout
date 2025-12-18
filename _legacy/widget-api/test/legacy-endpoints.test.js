// test/legacy-endpoints.test.js
// Unit tests to ensure legacy endpoints are properly deprecated

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app;

beforeAll(async () => {
  // Import the app after setting up test environment
  const { default: expressApp } = await import('../server.js');
  app = expressApp;
});

afterAll(async () => {
  // Cleanup if needed
});

describe('Legacy Endpoints Deprecation', () => {
  it('should return 410 for deprecated /api/v1/quote endpoint', async () => {
    const response = await request(app)
      .post('/api/v1/quote')
      .send({
        payLinkId: 'test-paylink',
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:usdc.near',
        amount: '1000000',
        chainId: 'near',
        refundTo: 'test.testnet'
      });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      success: false,
      error: 'ENDPOINT_DEPRECATED',
      message: 'This endpoint has been deprecated. Please use /api/v1/intents/quote instead.',
      redirect: '/api/v1/intents/quote'
    });
  });

  it('should not import intentsClient.js in server.js', async () => {
    // This test ensures the legacy client is not imported
    const fs = await import('fs');
    const serverContent = fs.readFileSync('server.js', 'utf8');
    
    // Should not contain the old import
    expect(serverContent).not.toMatch(/import.*intentsClient\.js/);
    
    // Should contain the deprecation comment
    expect(serverContent).toMatch(/Removed - using new intents system/);
  });
});

