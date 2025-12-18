export type ApiKeyType = "secret" | "publishable";

export type ApiKeyStatus = "active" | "revoked";

export type ApiKeySummary = {
  id: string;
  merchantId: string;
  label?: string | null;
  type: ApiKeyType;
  status: ApiKeyStatus;
  allowedOrigins: string[];
  scopes: string[];
  createdAt: Date | string;
  revokedAt?: Date | string | null;
  lastUsedAt?: Date | string | null;
};

export class MerchantNotFoundError extends Error {
  constructor(message: string = "Merchant not found") {
    super(message);
    this.name = "MerchantNotFoundError";
  }
}

export class InvalidApiKeyConfigError extends Error {
  constructor(message: string = "Invalid API key configuration") {
    super(message);
    this.name = "InvalidApiKeyConfigError";
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor(message: string = "API key not found") {
    super(message);
    this.name = "ApiKeyNotFoundError";
  }
}

export class ApiKeyRevokedError extends Error {
  constructor(message: string = "API key is revoked") {
    super(message);
    this.name = "ApiKeyRevokedError";
  }
}

export async function listApiKeys(
  _merchantId: string,
): Promise<ApiKeySummary[]> {
  return [];
}

export type CreateApiKeyInput = {
  merchantId: string;
  label?: string | null;
  type: ApiKeyType;
  allowedOrigins?: string[];
  scopes?: string[];
};

export async function createApiKey(
  _input: CreateApiKeyInput,
): Promise<{ apiKey: ApiKeySummary; plainTextKey: string }> {
  return {
    apiKey: {
      id: "",
      merchantId: _input.merchantId,
      label: _input.label ?? null,
      type: _input.type,
      status: "active",
      allowedOrigins: _input.allowedOrigins ?? [],
      scopes: _input.scopes ?? [],
      createdAt: new Date(),
      revokedAt: null,
      lastUsedAt: null,
    },
    plainTextKey: "",
  };
}

export type RegenerateApiKeyInput = {
  keyId: string;
};

export async function regenerateApiKey(
  _input: RegenerateApiKeyInput,
): Promise<{ apiKey: ApiKeySummary; plainTextKey: string }> {
  // This is a stub. In a real implementation, this would:
  // 1. Find the API key by ID
  // 2. Verify it belongs to the merchant
  // 3. Check it's not revoked
  // 4. Generate a new plaintext key
  // 5. Update the key hash in the database
  // 6. Return the updated key summary and new plaintext key
  throw new ApiKeyNotFoundError();
}

export type RevokeApiKeyInput = {
  keyId: string;
};

export async function revokeApiKey(
  _input: RevokeApiKeyInput,
): Promise<ApiKeySummary> {
  // This is a stub. In a real implementation, this would:
  // 1. Find the API key by ID
  // 2. Verify it belongs to the merchant
  // 3. If already revoked, return the key (idempotent)
  // 4. Set status to 'revoked' and set revokedAt timestamp
  // 5. Return the updated key summary
  throw new ApiKeyNotFoundError();
}

export type ApiKeyUsageFilters = {
  from?: Date;
  to?: Date;
  limitDays?: number;
};

export type ApiKeyUsageByDay = {
  date: Date | string; // ISO date string in response
  totalRequests: number;
  successCount: number;
  errorCount: number;
};

export type ApiKeyUsageSummary = {
  apiKeyId: string;
  merchantId: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  firstSeenAt?: Date | string; // ISO datetime in response
  lastSeenAt?: Date | string; // ISO datetime in response
  byDay: ApiKeyUsageByDay[];
};

export async function getApiKeyUsage(
  _merchantId: string,
  _apiKeyId: string,
  _filters: ApiKeyUsageFilters,
): Promise<ApiKeyUsageSummary> {
  // This is a stub. In a real implementation, this would:
  // 1. Verify the API key exists and belongs to the merchant
  // 2. Query usage logs/analytics for the given key
  // 3. Apply date filters (from, to, limitDays)
  // 4. Aggregate statistics (total requests, success/error counts)
  // 5. Group by day for the byDay array
  // 6. Return the usage summary
  throw new ApiKeyNotFoundError();
}


