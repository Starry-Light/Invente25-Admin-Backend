import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export function createApi(token) {
  const instance = axios.create({ baseURL: API_BASE });
  instance.interceptors.request.use((cfg) => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });
  return instance;
}

// Create a default instance that uses token from localStorage
const defaultApi = createApi(localStorage.getItem('token'));

// Update token when it changes
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    Object.assign(defaultApi, createApi(e.newValue));
  }
});

export default defaultApi;
