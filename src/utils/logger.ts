import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  enabled: !isTest || process.env.ENABLE_TEST_LOGS === 'true',
  redact: ['req.headers.authorization', 'req.headers.cookie']
});

export const authLogger = logger.child({ module: 'auth' });
