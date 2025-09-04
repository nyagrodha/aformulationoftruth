import axios from 'axios';

// Same-origin calls, send session cookie
const api = axios.create({
  baseURL: 'var/www/questionnaire/frontend/did somebody ',                 // hits your Express app via the same domain
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

export default api;
