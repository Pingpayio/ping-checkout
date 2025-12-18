export function createCheckoutSession(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>>;

export function getCheckoutSessionById(
  merchantId: string,
  sessionId: string,
): Promise<Record<string, unknown> | null>;



