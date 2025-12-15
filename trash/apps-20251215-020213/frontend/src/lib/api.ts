import axios from 'axios';
import { apiFetch, apiGet, apiPost, apiPatch, apiDelete } from './apiFailover';

// Legacy axios instance (deprecated - use api object below instead)
const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/**
 * API client with automatic failover between endpoints
 * Uses gimbal.fobdongle.com (primary) and proust.aformulationoftruth.com (backup)
 */
export const api = {
  /**
   * GET request with failover
   */
  async get(path: string, config?: any) {
    const response = await apiGet(path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return { data, status: response.status, statusText: response.statusText, headers: response.headers };
  },

  /**
   * POST request with failover
   */
  async post(path: string, body?: any, config?: any) {
    const response = await apiPost(path, body);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return { data, status: response.status, statusText: response.statusText, headers: response.headers };
  },

  /**
   * PATCH request with failover
   */
  async patch(path: string, body?: any, config?: any) {
    const response = await apiPatch(path, body);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return { data, status: response.status, statusText: response.statusText, headers: response.headers };
  },

  /**
   * DELETE request with failover
   */
  async delete(path: string, config?: any) {
    const response = await apiDelete(path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    // DELETE might not return JSON
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { data, status: response.status, statusText: response.statusText, headers: response.headers };
  },
};

// Export failover functions for direct use
export { apiFetch, apiGet, apiPost, apiPatch, apiDelete };

export default api;
