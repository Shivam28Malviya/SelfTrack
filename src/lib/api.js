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

  try {
    return await res.json()
  } catch {
    return { success: false, error: 'Unexpected server response.' }
  }
}
