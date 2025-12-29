import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure log directory exists
const logDir = '/var/log/aformulationoftruth';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
}

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'aformulationoftruth' },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // All logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    // Auth-specific logs
    new winston.transports.File({
      filename: path.join(logDir, 'auth.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Helper methods for common logging scenarios
export const logAuth = {
  success: (message: string, meta?: any) => {
    logger.info(message, { category: 'auth', event: 'success', ...meta });
  },
  failure: (message: string, meta?: any) => {
    logger.warn(message, { category: 'auth', event: 'failure', ...meta });
  },
  error: (message: string, error: Error, meta?: any) => {
    logger.error(message, {
      category: 'auth',
      event: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...meta,
    });
  },
  attempt: (message: string, meta?: any) => {
    logger.info(message, { category: 'auth', event: 'attempt', ...meta });
  },
};

export const logAPI = {
  request: (method: string, path: string, meta?: any) => {
    logger.info(`${method} ${path}`, { category: 'api', event: 'request', ...meta });
  },
  response: (method: string, path: string, status: number, duration: number, meta?: any) => {
    logger.info(`${method} ${path} ${status}`, {
      category: 'api',
      event: 'response',
      status,
      duration,
      ...meta,
    });
  },
  error: (method: string, path: string, error: Error, meta?: any) => {
    logger.error(`${method} ${path} error`, {
      category: 'api',
      event: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...meta,
    });
  },
};

export const logDB = {
  query: (message: string, meta?: any) => {
    logger.debug(message, { category: 'database', event: 'query', ...meta });
  },
  error: (message: string, error: Error, meta?: any) => {
    logger.error(message, {
      category: 'database',
      event: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...meta,
    });
  },
};

export default logger;
