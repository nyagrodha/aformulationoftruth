/**
 * Token utility functions for managing JWT authentication
 */

interface DecodedToken {
  email: string;
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  userId?: number;
}

/**
 * Decode a JWT token without verification (for client-side expiration checks)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded as DecodedToken;
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
}

/**
 * Get the expiration time of a token in milliseconds
 */
export function getTokenExpirationTime(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }

  return decoded.exp * 1000; // Convert to milliseconds
}

/**
 * Get the remaining time until token expiration in milliseconds
 */
export function getTimeUntilExpiration(token: string): number {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return 0;
  }

  const remainingTime = expirationTime - Date.now();
  return Math.max(0, remainingTime);
}

/**
 * Check if token will expire within a certain number of minutes
 */
export function willExpireSoon(token: string, minutesThreshold: number = 5): boolean {
  const remainingTime = getTimeUntilExpiration(token);
  const thresholdMs = minutesThreshold * 60 * 1000;
  return remainingTime > 0 && remainingTime <= thresholdMs;
}

/**
 * Format remaining time as a human-readable string
 */
export function formatRemainingTime(token: string): string {
  const remainingMs = getTimeUntilExpiration(token);

  if (remainingMs <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Clear authentication data from localStorage
 */
export function clearAuthData(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('userEmail');
}

/**
 * Get stored token from localStorage
 */
export function getStoredToken(): string | null {
  return localStorage.getItem('token');
}

/**
 * Validate and get token, returns null if expired
 */
export function getValidToken(): string | null {
  const token = getStoredToken();
  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    clearAuthData();
    return null;
  }

  return token;
}
