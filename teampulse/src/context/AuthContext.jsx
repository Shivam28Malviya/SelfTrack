import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiCall, getToken, setToken } from '../lib/api'

const AuthContext = createContext(null)

/**
 * Who is signed in.
 *
 * Deliberately small: a token in localStorage and the account it belongs to.
 * The session is confirmed against the server on load, because a token that
 * has expired should send someone to the sign-in page rather than into an app
 * where every request fails.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    if (!getToken()) { setInitializing(false); return }
    apiCall('GET', '/auth/me').then((res) => {
      if (res.success) setUser(res.user)
      else setToken(null)
      setInitializing(false)
    })
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await apiCall('POST', '/auth/login', { email, password })
    if (!res.success) return res
    setToken(res.token)
    setUser(res.user)
    return res
  }, [])

  const logout = useCallback(async () => {
    await apiCall('POST', '/auth/logout')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
