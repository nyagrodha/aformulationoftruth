/**
 * Logger Utility using Winston
 *
 * Provides structured logging with different levels and transports
 */
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/environment.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Define log format
const logFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.errors({ stack: true }), winston.format.splat(), winston.format.json());
// Console format for development
const consoleFormat = winston.format.combine(winston.format.colorize(), winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
}));
// Create logger instance
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: config.project.name },
    transports: [
        // Error logs
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Combined logs
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// Add console transport in non-production environments
if (config.project.nodeEnv !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
    }));
}
// Create a stream for Morgan HTTP logging
export const stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};
// Export logger methods
export const log = {
    error: (message, meta) => logger.error(message, meta),
    warn: (message, meta) => logger.warn(message, meta),
    info: (message, meta) => logger.info(message, meta),
    http: (message, meta) => logger.http(message, meta),
    debug: (message, meta) => logger.debug(message, meta),
};
export default logger;
