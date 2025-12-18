import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../api-gateway/openapi/openapiBuilder.ts';
import type { oas30 } from 'openapi3-ts';

describe('OpenAPI Builder', () => {
  it('returns a valid OpenAPI 3.0.0 spec', () => {
    const spec = getOpenApiSpec();

    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('Ping Platform API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.info.description).toBe('PingPay Widget API / Checkout API');
  });

  it('includes servers configuration', () => {
    const spec = getOpenApiSpec();

    expect(spec.servers).toBeDefined();
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(spec.servers[0].url).toBeDefined();
  });

  it('includes the widget bootstrap endpoint', () => {
    const spec = getOpenApiSpec();

    expect(spec.paths).toBeDefined();
    expect(spec.paths['/widget/bootstrap']).toBeDefined();
    expect(spec.paths['/widget/bootstrap'].get).toBeDefined();
    expect(spec.paths['/widget/bootstrap'].get?.summary).toBe('Get widget bootstrap configuration');
  });

  it('includes the checkout sessions POST endpoint', () => {
    const spec = getOpenApiSpec();

    expect(spec.paths['/checkout/sessions']).toBeDefined();
    expect(spec.paths['/checkout/sessions'].post).toBeDefined();
    expect(spec.paths['/checkout/sessions'].post?.summary).toBe('Create a checkout session');
  });

  it('includes the checkout sessions GET endpoint', () => {
    const spec = getOpenApiSpec();

    expect(spec.paths['/checkout/sessions/{sessionId}']).toBeDefined();
    expect(spec.paths['/checkout/sessions/{sessionId}'].get).toBeDefined();
    expect(spec.paths['/checkout/sessions/{sessionId}'].get?.summary).toBe('Get checkout session by ID');
  });

  it('defines ErrorResponse schema in components', () => {
    const spec = getOpenApiSpec();

    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(spec.components.schemas.ErrorResponse).toBeDefined();
    expect(spec.components.schemas.ErrorResponse.type).toBe('object');
    expect(spec.components.schemas.ErrorResponse.properties).toBeDefined();
    expect(spec.components.schemas.ErrorResponse.properties.code).toBeDefined();
    expect(spec.components.schemas.ErrorResponse.properties.message).toBeDefined();
  });

  it('defines CheckoutSession schema in components', () => {
    const spec = getOpenApiSpec();

    expect(spec.components.schemas.CheckoutSession).toBeDefined();
    expect(spec.components.schemas.CheckoutSession.type).toBe('object');
    expect(spec.components.schemas.CheckoutSession.properties).toBeDefined();
    expect(spec.components.schemas.CheckoutSession.properties.sessionId).toBeDefined();
    expect(spec.components.schemas.CheckoutSession.properties.status).toBeDefined();
  });

  it('uses $ref references for nested schemas', () => {
    const spec = getOpenApiSpec();

    // Check that CreateCheckoutSessionRequest uses $ref for nested schemas
    const createRequest = spec.components.schemas.CreateCheckoutSessionRequest;
    expect(createRequest).toBeDefined();
    expect(createRequest.properties.amount).toBeDefined();
    expect(createRequest.properties.amount.$ref).toBe('#/components/schemas/AssetAmount');
    expect(createRequest.properties.recipient).toBeDefined();
    expect(createRequest.properties.recipient.$ref).toBe('#/components/schemas/Party');
  });

  it('references ErrorResponse in error responses', () => {
    const spec = getOpenApiSpec();

    // Check widget bootstrap endpoint
    const widgetBootstrap = spec.paths['/widget/bootstrap'].get;
    expect(widgetBootstrap?.responses['401']).toBeDefined();
    expect(widgetBootstrap?.responses['401'].content).toBeDefined();
    expect(widgetBootstrap?.responses['401'].content['application/json'].schema.$ref).toBe(
      '#/components/schemas/ErrorResponse'
    );

    // Check checkout sessions POST endpoint
    const checkoutPost = spec.paths['/checkout/sessions'].post;
    expect(checkoutPost?.responses['400']).toBeDefined();
    expect(checkoutPost?.responses['400'].content['application/json'].schema.$ref).toBe(
      '#/components/schemas/ErrorResponse'
    );
  });

  it('references CheckoutSession schema in responses', () => {
    const spec = getOpenApiSpec();

    const checkoutPost = spec.paths['/checkout/sessions'].post;
    expect(checkoutPost?.responses['201']).toBeDefined();
    expect(checkoutPost?.responses['201'].content['application/json'].schema).toBeDefined();
    expect(checkoutPost?.responses['201'].content['application/json'].schema.properties.session.$ref).toBe(
      '#/components/schemas/CheckoutSession'
    );

    const checkoutGet = spec.paths['/checkout/sessions/{sessionId}'].get;
    expect(checkoutGet?.responses['200']).toBeDefined();
    expect(checkoutGet?.responses['200'].content['application/json'].schema.properties.session.$ref).toBe(
      '#/components/schemas/CheckoutSession'
    );
  });

  it('includes required query parameters', () => {
    const spec = getOpenApiSpec();

    const widgetBootstrap = spec.paths['/widget/bootstrap'].get;
    expect(widgetBootstrap?.parameters).toBeDefined();
    expect(widgetBootstrap?.parameters.length).toBeGreaterThan(0);
    const publishableKeyParam = widgetBootstrap?.parameters.find((p: any) => p.name === 'publishableKey');
    expect(publishableKeyParam).toBeDefined();
    expect(publishableKeyParam.in).toBe('query');
    expect(publishableKeyParam.required).toBe(true);
  });

  it('includes required path parameters', () => {
    const spec = getOpenApiSpec();

    const checkoutGet = spec.paths['/checkout/sessions/{sessionId}'].get;
    expect(checkoutGet?.parameters).toBeDefined();
    expect(checkoutGet?.parameters.length).toBeGreaterThan(0);
    const sessionIdParam = checkoutGet?.parameters.find((p: any) => p.name === 'sessionId');
    expect(sessionIdParam).toBeDefined();
    expect(sessionIdParam.in).toBe('path');
    expect(sessionIdParam.required).toBe(true);
  });

  it('returns a valid OpenAPIObject structure', () => {
    const spec = getOpenApiSpec();

    // Basic structure validation
    expect(spec).toHaveProperty('openapi');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('paths');
    expect(spec).toHaveProperty('components');

    // Type check
    const typedSpec: oas30.OpenAPIObject = spec;
    expect(typedSpec).toBeDefined();
  });
});

