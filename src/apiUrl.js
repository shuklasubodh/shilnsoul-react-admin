const configuredApiUrl = String(import.meta.env.VITE_ADMIN_API_URL || '').trim()

export const API_URL = (configuredApiUrl || '/api/admin').replace(/\/+$/, '')
export const apiUrl = (path = '') => `${API_URL}/${String(path).replace(/^\/+/, '')}`