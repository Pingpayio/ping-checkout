import type { oas30 } from 'openapi3-ts';

/**
 * Build OpenAPI 3.x specification from existing Zod schemas
 * 
 * Note: Schemas are manually defined to match the Zod schemas in:
 * - api-gateway/schemas/widgetSchemas.ts
 * - api-gateway/schemas/checkoutSchemas.ts
 * 
 * In a future iteration, this could be automated with a Zod-to-OpenAPI converter.
 */

/**
 * Build OpenAPI 3.x specification from existing Zod schemas
 */
export function getOpenApiSpec(): oas30.OpenAPIObject {
  const baseUrl = process.env.API_BASE_URL || process.env.WIDGET_API_BASE_URL || 'https://api.pingpay.io/api/v1';

  return {
    openapi: '3.0.0',
    info: {
      title: 'Ping Platform API',
      version: '1.0.0',
      description: 'PingPay Widget API / Checkout API',
    },
    servers: [
      { url: baseUrl },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
        WidgetBootstrapResponse: {
          type: 'object',
          properties: {
            merchantId: { type: 'string' },
            allowedOrigins: {
              type: 'array',
              items: { type: 'string' },
            },
            apiBaseUrl: { type: 'string', format: 'uri' },
            defaultTheme: {
              type: 'object',
              properties: {
                brandColor: { type: 'string' },
                logoUrl: { type: 'string', format: 'uri' },
                buttonText: { type: 'string' },
                mode: { type: 'string', enum: ['light', 'dark', 'auto'] },
              },
            },
          },
          required: ['merchantId', 'allowedOrigins', 'apiBaseUrl', 'defaultTheme'],
        },
        Party: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            chainId: { type: 'string' },
          },
          required: ['address', 'chainId'],
        },
        AssetAmount: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            amount: { type: 'string', pattern: '^\\d+$' },
          },
          required: ['assetId', 'amount'],
        },
        Theme: {
          type: 'object',
          properties: {
            brandColor: { type: 'string' },
            logoUrl: { type: 'string', format: 'uri' },
            buttonText: { type: 'string' },
          },
        },
        CreateCheckoutSessionRequest: {
          type: 'object',
          properties: {
            amount: { $ref: '#/components/schemas/AssetAmount' },
            recipient: { $ref: '#/components/schemas/Party' },
            theme: { $ref: '#/components/schemas/Theme' },
            successUrl: { type: 'string', format: 'uri' },
            cancelUrl: { type: 'string', format: 'uri' },
            metadata: { type: 'object', additionalProperties: true },
          },
          required: ['amount', 'recipient'],
        },
        CheckoutSession: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            status: { type: 'string', enum: ['CREATED', 'PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'] },
            paymentId: { type: 'string', nullable: true },
            amount: { $ref: '#/components/schemas/AssetAmount' },
            recipient: { $ref: '#/components/schemas/Party' },
            theme: { $ref: '#/components/schemas/Theme' },
            successUrl: { type: 'string', format: 'uri' },
            cancelUrl: { type: 'string', format: 'uri' },
            createdAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            sessionUrl: { type: 'string', format: 'uri' },
          },
          required: ['sessionId', 'status', 'amount', 'recipient', 'createdAt', 'sessionUrl'],
        },
      },
    },
    paths: {
      '/widget/bootstrap': {
        get: {
          summary: 'Get widget bootstrap configuration',
          description: 'Retrieves widget configuration for a given publishable key',
          parameters: [
            {
              name: 'publishableKey',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Publishable API key',
            },
          ],
          responses: {
            '200': {
              description: 'Widget bootstrap configuration',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WidgetBootstrapResponse' },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/checkout/sessions': {
        post: {
          summary: 'Create a checkout session',
          description: 'Creates a new checkout session for payment processing',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateCheckoutSessionRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Checkout session created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      session: { $ref: '#/components/schemas/CheckoutSession' },
                      sessionUrl: { type: 'string', format: 'uri' },
                    },
                    required: ['session', 'sessionUrl'],
                  },
                },
              },
            },
            '400': {
              description: 'Bad Request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '403': {
              description: 'Forbidden',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/checkout/sessions/{sessionId}': {
        get: {
          summary: 'Get checkout session by ID',
          description: 'Retrieves a checkout session by its ID',
          parameters: [
            {
              name: 'sessionId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Checkout session ID',
            },
          ],
          responses: {
            '200': {
              description: 'Checkout session details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      session: { $ref: '#/components/schemas/CheckoutSession' },
                      sessionUrl: { type: 'string', format: 'uri' },
                    },
                    required: ['session', 'sessionUrl'],
                  },
                },
              },
            },
            '404': {
              description: 'Not Found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
  };
}

