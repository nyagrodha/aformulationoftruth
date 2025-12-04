/**
 * API Failover Client - Standalone JavaScript version
 *
 * Provides automatic failover between multiple API endpoints.
 * Can be included in any HTML file via <script> tag.
 */

(function(window) {
  'use strict';

  // API endpoints in priority order
  const API_ENDPOINTS = [
    'https://gimbal.fobdongle.com',  // Primary
    'https://proust.aformulationoftruth.com'  // Backup
  ];

  const REQUEST_TIMEOUT = 5000; // 5 seconds

  /**
   * Wrapper for fetch with timeout support
   */
  async function fetchWithTimeout(url, options = {}) {
    const timeout = options.timeout || REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
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
   * @param {string} path - API path (e.g., '/api/auth/login' or 'auth/login')
   * @param {Object} options - Fetch options (method, headers, body, etc.)
   * @returns {Promise<Response>} Response from the first successful endpoint
   * @throws {Error} if all endpoints fail
   */
  async function apiFetch(path, options = {}) {
    // Normalize path to start with /api/
    let normalizedPath = path;
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }
    if (!normalizedPath.startsWith('/api/')) {
      normalizedPath = '/api' + normalizedPath;
    }

    const errors = [];

    // Try each endpoint in order
    for (let i = 0; i < API_ENDPOINTS.length; i++) {
      const endpoint = API_ENDPOINTS[i];
      const url = endpoint + normalizedPath;

      try {
        console.log('[API Failover] Attempting request to:', url);
        const response = await fetchWithTimeout(url, options);

        // Check if response is ok (status 200-299)
        if (response.ok) {
          console.log('[API Failover] ✓ Success from:', endpoint);
          return response;
        }

        // Non-OK response (4xx, 5xx) - still return it as it's a valid response
        // Only failover on network errors, not HTTP errors
        console.log('[API Failover] Response', response.status, 'from:', endpoint);
        return response;

      } catch (error) {
        const errorMessage = error.message || String(error);
        console.warn('[API Failover] ✗ Failed to reach', endpoint + ':', errorMessage);

        errors.push({ endpoint, error: errorMessage });

        // If this isn't the last endpoint, continue to next
        if (i < API_ENDPOINTS.length - 1) {
          console.log('[API Failover] Trying next endpoint...');
          continue;
        }
      }
    }

    // All endpoints failed
    console.error('[API Failover] All endpoints failed:', errors);
    throw new Error(
      'All API endpoints failed. Errors: ' +
      errors.map(e => e.endpoint + ': ' + e.error).join(', ')
    );
  }

  /**
   * Convenience wrapper for GET requests
   */
  async function apiGet(path, options = {}) {
    return apiFetch(path, { ...options, method: 'GET' });
  }

  /**
   * Convenience wrapper for POST requests
   */
  async function apiPost(path, body = null, options = {}) {
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
  async function apiPatch(path, body = null, options = {}) {
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
  async function apiDelete(path, options = {}) {
    return apiFetch(path, { ...options, method: 'DELETE' });
  }

  // Export to global scope
  window.apiFetch = apiFetch;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.apiPatch = apiPatch;
  window.apiDelete = apiDelete;

  console.log('[API Failover] Client loaded. Endpoints:', API_ENDPOINTS);

})(window);
