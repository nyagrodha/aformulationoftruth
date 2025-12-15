/**
 * API Failover Client
 *
 * Provides automatic failover between multiple API endpoints.
 * Tries endpoints in priority order with timeout, returning the first successful response.
 */

// API endpoints in priority order
const API_ENDPOINTS = [
  'https://gimbal.fobdongle.com',  // Primary
  'https://proust.aformulationoftruth.com'  // Backup
];

const REQUEST_TIMEOUT = 5000; // 5 seconds

interface ApiFetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Wrapper for fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { timeout = REQUEST_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'include', // Include cookies for CORS
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Main API fetch function with automatic failover
 *
 * @param path - API path (e.g., '/api/auth/login' or 'auth/login')
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns Response from the first successful endpoint
 * @throws Error if all endpoints fail
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  // Normalize path to start with /api/
  let normalizedPath = path;
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  if (!normalizedPath.startsWith('/api/')) {
    normalizedPath = '/api' + normalizedPath;
  }

  const errors: Array<{ endpoint: string; error: any }> = [];

  // Try each endpoint in order
  for (let i = 0; i < API_ENDPOINTS.length; i++) {
    const endpoint = API_ENDPOINTS[i];
    const url = `${endpoint}${normalizedPath}`;

    try {
      console.log(`[API Failover] Attempting request to: ${url}`);
      const response = await fetchWithTimeout(url, options);

      // Check if response is ok (status 200-299)
      if (response.ok) {
        console.log(`[API Failover] ✓ Success from: ${endpoint}`);
        return response;
      }

      // Non-OK response (4xx, 5xx) - still return it as it's a valid response
      // Only failover on network errors, not HTTP errors
      console.log(`[API Failover] Response ${response.status} from: ${endpoint}`);
      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[API Failover] ✗ Failed to reach ${endpoint}: ${errorMessage}`);

      errors.push({ endpoint, error });

      // If this isn't the last endpoint, continue to next
      if (i < API_ENDPOINTS.length - 1) {
        console.log(`[API Failover] Trying next endpoint...`);
        continue;
      }
    }
  }

  // All endpoints failed
  console.error('[API Failover] All endpoints failed:', errors);
  throw new Error(
    `All API endpoints failed. Errors: ${errors.map(e => `${e.endpoint}: ${e.error?.message || e.error}`).join(', ')}`
  );
}

/**
 * Convenience wrapper for GET requests
 */
export async function apiGet(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  return apiFetch(path, { ...options, method: 'GET' });
}

/**
 * Convenience wrapper for POST requests
 */
export async function apiPost(
  path: string,
  body?: any,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return apiFetch(path, {
    ...options,
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience wrapper for PATCH requests
 */
export async function apiPatch(
  path: string,
  body?: any,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return apiFetch(path, {
    ...options,
    method: 'PATCH',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience wrapper for DELETE requests
 */
export async function apiDelete(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  return apiFetch(path, { ...options, method: 'DELETE' });
}

/**
 * Get the list of configured API endpoints
 */
export function getApiEndpoints(): string[] {
  return [...API_ENDPOINTS];
}
