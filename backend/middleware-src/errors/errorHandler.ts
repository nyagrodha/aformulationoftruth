/**
 * Error Handler Middleware
 *
 * Centralized error handling for Express application
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError.js';
import { isDevelopment } from '../../config/environment.js';

/**
 * Format error response
 */
interface ErrorResponse {
  error: {
    message: string;
    statusCode: number;
    stack?: string;
    details?: any;
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  // Check if it's our custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else {
    // Handle known error types
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = err.message;
    } else if (err.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Invalid token';
    } else if (err.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid data format';
    }
  }

  // Log error
  console.error('Error:', {
    message: err.message,
    statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Prepare response
  const response: ErrorResponse = {
    error: {
      message: isOperational ? message : 'Internal server error',
      statusCode,
    },
  };

  // Include stack trace in development
  if (isDevelopment()) {
    response.error.stack = err.stack;
    if (!isOperational) {
      response.error.details = err.message;
    }
  }

  // Send response
  res.status(statusCode).json(response);
}

/**
 * Handle 404 errors
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.url} not found`,
      statusCode: 404,
    },
  });
}

/**
 * Async error wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
