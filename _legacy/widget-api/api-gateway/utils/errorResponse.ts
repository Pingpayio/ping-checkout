import type { Response } from 'express';

interface ErrorPayload {
  code: string;
  message: string;
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  const payload: ErrorPayload = { code, message };
  res.status(status).json(payload);
}



