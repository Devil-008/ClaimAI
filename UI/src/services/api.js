import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// VITE_API_URL in .env.local overrides this (e.g. http://192.168.1.x:8000/api)
// Default: direct to FastAPI so it works with OR without the Vite proxy
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: BASE_URL,
  // Do NOT set a default Content-Type here.
  // axios sets it automatically (including multipart boundary for FormData).
  // JSON requests get 'application/json' set per-request or by axios default.
})

/* Attach Bearer token on every request */
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  // For JSON payloads (non-FormData), set Content-Type explicitly
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json'
  }
  return config
})

/* Handle 401 → logout */
api.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
