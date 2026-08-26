// Keep API calls same-origin in every environment. Vite proxies /api locally,
// and vercel.json proxies it in deployed builds.
export const API_URL = '/api/admin'
export const apiUrl = (path = '') => `${API_URL}/${String(path).replace(/^\/+/, '')}`
