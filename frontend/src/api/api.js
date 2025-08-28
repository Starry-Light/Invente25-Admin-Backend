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
