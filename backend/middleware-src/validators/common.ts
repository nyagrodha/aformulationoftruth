/**
 * Common Validation Rules
 *
 * Reusable validation middleware using express-validator
 */

import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/AppError.js';

/**
 * Handle validation results
 */
export function handleValidationErrors(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: 'param' in err ? err.param : 'unknown',
      message: err.msg,
    }));

    throw new ValidationError(JSON.stringify(errorMessages));
  }

  next();
}

/**
 * Email validation
 */
export const validateEmail = () =>
  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail()
    .isLength({ max: 320 })
    .withMessage('Email too long');

/**
 * Question ID validation
 */
export const validateQuestionId = () =>
  body('questionId')
    .isInt({ min: 1 })
    .withMessage('Question ID must be a positive integer');

/**
 * Answer text validation
 */
export const validateAnswerText = () =>
  body('answer')
    .trim()
    .notEmpty()
    .withMessage('Answer cannot be empty')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Answer must be between 1 and 10000 characters');

/**
 * Phone number validation
 */
export const validatePhoneNumber = () =>
  body('phoneNumber')
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Invalid phone number format (E.164)');

/**
 * Verification code validation
 */
export const validateVerificationCode = () =>
  body('code')
    .trim()
    .isLength({ min: 4, max: 8 })
    .withMessage('Invalid verification code')
    .isAlphanumeric()
    .withMessage('Verification code must be alphanumeric');

/**
 * User ID parameter validation
 */
export const validateUserId = () =>
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer');

/**
 * Session hash validation
 */
export const validateSessionHash = () =>
  body('sessionHash')
    .trim()
    .isLength({ min: 32, max: 128 })
    .withMessage('Invalid session hash format')
    .matches(/^[a-f0-9]+$/)
    .withMessage('Session hash must be hexadecimal');

/**
 * Pagination validation
 */
export const validatePagination = () => [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/**
 * Generic text field validation
 */
export const validateTextField = (fieldName: string, minLength: number = 1, maxLength: number = 1000) =>
  body(fieldName)
    .trim()
    .isLength({ min: minLength, max: maxLength })
    .withMessage(`${fieldName} must be between ${minLength} and ${maxLength} characters`);

/**
 * URL validation
 */
export const validateUrl = (fieldName: string = 'url') =>
  body(fieldName)
    .trim()
    .isURL({ protocols: ['http', 'https'] })
    .withMessage('Invalid URL format');

/**
 * Boolean validation
 */
export const validateBoolean = (fieldName: string) =>
  body(fieldName)
    .isBoolean()
    .withMessage(`${fieldName} must be a boolean value`);

/**
 * Array validation
 */
export const validateArray = (fieldName: string, minLength: number = 1, maxLength: number = 100) =>
  body(fieldName)
    .isArray({ min: minLength, max: maxLength })
    .withMessage(`${fieldName} must be an array with ${minLength} to ${maxLength} items`);
