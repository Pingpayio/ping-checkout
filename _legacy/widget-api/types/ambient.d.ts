declare module '../../src/db/sqlite.js' {
  export const db: any;
}

declare module '../../src/services/checkout/checkoutService.js' {
  export function createCheckoutSession(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  export function getCheckoutSessionById(
    merchantId: string,
    sessionId: string,
  ): Promise<Record<string, unknown> | null>;
}

