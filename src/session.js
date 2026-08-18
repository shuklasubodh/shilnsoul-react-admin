export const ADMIN_TOKEN_KEY = 'admin_token'
export const ADMIN_IDENTITY_KEY = 'admin_identity'

const decodeClaims = (token) => {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
  } catch {
    return null
  }
}

export const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_IDENTITY_KEY)
}

export const getAdminToken = () => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  const claims = token && decodeClaims(token)
  if (!claims?.exp || claims.exp * 1000 <= Date.now() || claims.role !== 'ADMIN') {
    clearAdminSession()
    return null
  }
  return token
}

export const saveAdminSession = ({ token, user }) => {
  const claims = token && decodeClaims(token)
  if (!claims?.exp || claims.exp * 1000 <= Date.now() || claims.role !== 'ADMIN' || !user) throw new Error('The server returned an invalid administrator session.')
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
  localStorage.setItem(ADMIN_IDENTITY_KEY, JSON.stringify(user))
}

export const getAdminIdentity = () => {
  if (!getAdminToken()) return null
  try { return JSON.parse(localStorage.getItem(ADMIN_IDENTITY_KEY)) }
  catch { clearAdminSession(); return null }
}
