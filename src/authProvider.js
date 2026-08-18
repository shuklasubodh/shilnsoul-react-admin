import { HttpError } from 'react-admin'
import { apiUrl } from './apiUrl'
import { clearAdminSession, getAdminIdentity, getAdminToken, saveAdminSession } from './session'

export const authProvider = {
  login: async ({ username, password }) => {
    const response = await fetch(apiUrl('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: username, password }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new HttpError(payload.error || 'Login failed.', response.status, payload)
    saveAdminSession(payload)
  },
  logout: () => { clearAdminSession(); return Promise.resolve() },
  checkAuth: () => getAdminToken()
    ? Promise.resolve()
    : Promise.reject({ redirectTo: '/login', logoutUser: false }),
  checkError: (error) => {
    if (error?.status === 401 || error?.status === 403) {
      clearAdminSession()
      return Promise.reject()
    }
    return Promise.resolve()
  },
  getIdentity: () => {
    try {
      const identity = getAdminIdentity()
      return identity?.id ? Promise.resolve(identity) : Promise.reject()
    } catch { return Promise.reject() }
  },
  getPermissions: () => Promise.resolve('ADMIN'),
}
