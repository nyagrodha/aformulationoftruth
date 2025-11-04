import type { Request } from 'express';
import { authLogger } from './logger.js';
import { hashValue } from './security.js';

export function auditLog(req: Request, event: string, extra?: Record<string, unknown>): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const ua = req.get('user-agent') ?? 'unknown';
  authLogger.info(
    {
      event,
      ipHash: hashValue(ip),
      userAgentHash: hashValue(ua),
      ...extra
    },
    event
  );
}
