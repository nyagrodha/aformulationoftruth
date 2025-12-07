/**
 * Validation Utilities
 *
 * Centralized validation logic for common data types
 */

/**
 * Validate email address format
 *
 * @param email - The email address to validate
 * @returns True if valid email format, false otherwise
 *
 * @example
 * isValidEmail('user@example.com') // true
 * isValidEmail('invalid-email') // false
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email) && email.length <= 320; // Max email length per RFC
}

/**
 * Validate phone number format
 *
 * @param phone - The phone number to validate
 * @returns True if valid phone format, false otherwise
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // E.164 international phone number format
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

/**
 * Validate URL format
 *
 * @param url - The URL to validate
 * @returns True if valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize text input by trimming and removing control characters
 *
 * @param text - The text to sanitize
 * @param maxLength - Optional maximum length
 * @returns Sanitized text
 */
export function sanitizeText(text: string, maxLength?: number): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove control characters except newline and tab
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate that a string is not empty after trimming
 *
 * @param value - The value to check
 * @returns True if not empty, false otherwise
 */
export function isNotEmpty(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate string length is within bounds
 *
 * @param value - The string to check
 * @param min - Minimum length
 * @param max - Maximum length
 * @returns True if within bounds, false otherwise
 */
export function isValidLength(value: string, min: number, max: number): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const length = value.trim().length;
  return length >= min && length <= max;
}

/**
 * Validate integer value is within bounds
 *
 * @param value - The value to check
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns True if valid integer within bounds, false otherwise
 */
export function isValidInteger(value: any, min?: number, max?: number): boolean {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (!Number.isInteger(num)) {
    return false;
  }

  if (min !== undefined && num < min) {
    return false;
  }

  if (max !== undefined && num > max) {
    return false;
  }

  return true;
}

/**
 * Check if value is a valid ISO 8601 date string
 *
 * @param dateString - The date string to validate
 * @returns True if valid date, false otherwise
 */
export function isValidDate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Validate JSON string
 *
 * @param jsonString - The JSON string to validate
 * @returns True if valid JSON, false otherwise
 */
export function isValidJSON(jsonString: string): boolean {
  if (!jsonString || typeof jsonString !== 'string') {
    return false;
  }

  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a value is in an allowed list
 *
 * @param value - The value to check
 * @param allowedValues - Array of allowed values
 * @returns True if value is in allowed list, false otherwise
 */
export function isInAllowedList<T>(value: T, allowedValues: T[]): boolean {
  return allowedValues.includes(value);
}
