import axios from 'axios';
// This is a placeholder for your centralized axios instance.
// It can be configured with base URLs, headers, and interceptors.
export const api = axios.create({
    baseURL: '/api',
});
export default api;
