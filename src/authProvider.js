import { HttpError } from 'react-admin'

const TOKEN_KEY = 'admin_token'
const IDENTITY_KEY = 'admin_identity'
const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(IDENTITY_KEY)
}

export const authProvider = {
  login: async ({ username, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new HttpError(payload.error || 'Login failed.', response.status, payload)
    localStorage.setItem(TOKEN_KEY, payload.token)
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(payload.user))
  },
  logout: () => { clearSession(); return Promise.resolve() },
  checkAuth: () => localStorage.getItem(TOKEN_KEY) ? Promise.resolve() : Promise.reject(),
  checkError: (error) => {
    if (error?.status === 401 || error?.status === 403) {
      clearSession()
      return Promise.reject()
    }
    return Promise.resolve()
  },
  getIdentity: () => {
    try {
      const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY))
      return identity?.id ? Promise.resolve(identity) : Promise.reject()
    } catch { return Promise.reject() }
  },
  getPermissions: () => Promise.resolve('ADMIN'),
}
