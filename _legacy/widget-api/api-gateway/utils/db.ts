export type ApiKeyType = 'publishable' | 'secret';

export interface ApiKeyRecord {
  id: string;
  key: string;
  merchantId: string;
  scopes: string[];
  revokedAt: Date | null;
  type: ApiKeyType;
  secret?: string;
}

type Finder = (key: string) => Promise<ApiKeyRecord | null>;

const notImplemented: Finder = async () => null;

export const apiKeyStore = {
  findActiveByKey: notImplemented
};



