import type { Request } from 'express';

export interface AuthContext {
  merchantId: string;
  scopes: string[];
  keyType: 'publishable' | 'secret';
  apiKeyId: string;
  secret?: string;
}

export interface AdminContext {
  isAdmin: boolean;
}

export type RequestWithAuth = Request & { auth?: AuthContext };
export type RequestWithAdmin = Request & { admin?: AdminContext };



