const TOKEN_KEY = 'selftrack_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export async function apiCall(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    return { success: false, error: 'Network error. Check your connection.' }
  }

  // Session expired or revoked (30-min TTL) — clear it and send the user
  // back to login. Auth endpoints are exempt (401 there = wrong credentials).
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null)
    window.location.assign('/login')
    return { success: false, error: 'Session expired. Please sign in again.' }
  }

  try {
    return await res.json()
  } catch {
    return { success: false, error: 'Unexpected server response.' }
  }
}
