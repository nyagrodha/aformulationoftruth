import axios, {
  AxiosInstance,
  AxiosRequestHeaders,
  InternalAxiosRequestConfig,
  AxiosError,
} from 'axios';
import { isTokenExpired, clearAuthData } from '../utils/tokenUtils';

const api: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5742',
});

// Request interceptor - check token validity before sending
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');

    if (token) {
      // Check if token is expired before sending request
      if (isTokenExpired(token)) {
        clearAuthData();
        window.location.href = '/?session=expired';
        return Promise.reject(new Error('Session expired'));
      }

      if (!config.headers) {
        config.headers = {} as AxiosRequestHeaders;
      }
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle authentication errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      clearAuthData();

      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/callback') && window.location.pathname !== '/') {
        window.location.href = '/?session=expired';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
