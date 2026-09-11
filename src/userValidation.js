import { getAdminToken } from './session'

export const validateUniquePhone = async (phone, values) => {
  if (!phone || !values.country_code) return undefined

  const query = new URLSearchParams({ country_code: values.country_code, phone: String(phone) })
  const token = getAdminToken()
  const response = await fetch(`/api/users/phone-availability?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) return payload.error || 'Unable to check whether this phone number is already registered.'
  return payload.available ? undefined : 'A user with this phone number already exists for the selected country.'
}
