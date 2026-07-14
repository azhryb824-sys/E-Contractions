import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  res => {
    const body = res.data;
    return body && body.data !== undefined ? body.data : body;
  },
  err => {
    const body = err.response?.data;
    const msg = body?.error || err.message || 'حدث خطأ غير متوقع';
    return Promise.reject(new Error(msg));
  }
);

export default api;
