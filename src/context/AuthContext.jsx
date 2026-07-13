import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiCall, getToken, setToken } from '../lib/api'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const DEFAULT_META = {
  rewards: { first: { text: '', image: '' }, second: { text: '', image: '' } },
  quote: { text: '', image: '' },
  results: { text: '' },
  weeklyWinners: [],
  categories: ['General'],
  announcement: { text: '', until: 0 },
  auditLog: [],
  seasons: [],
}

// Weeks run Monday–Sunday (matches week-champion numbering).
function startOfWeek(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export function pointsInPeriod(history, period, category = 'all') {
  if (!history) return 0
  const today = Date.now()
  return history
    .filter(h => category === 'all' || h.category === category)
    .filter(h => {
      if (period === 'all') return true
      const d = new Date(h.date)
      if (period === 'week') return startOfWeek(h.date) === startOfWeek(today)
      if (period === 'month') {
        const t = new Date(today)
        return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
      }
      if (period === 'year') return d.getFullYear() === new Date(today).getFullYear()
      return true
    })
    .reduce((s, h) => s + h.points, 0)
}

export function weeksPlayedCount(history) {
  if (!history || history.length === 0) return 0
  return new Set(history.map(h => startOfWeek(h.date))).size
}

function pointsInWeekOffset(history, offset) {
  if (!history) return 0
  const target = startOfWeek(Date.now()) - offset * WEEK_MS
  return history.filter(h => startOfWeek(h.date) === target).reduce((s, h) => s + h.points, 0)
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState(DEFAULT_META)
  const [notifications, setNotifications] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  const applyState = (data) => {
    setUsers(data.users || [])
    setMeta(data.meta || DEFAULT_META)
    setNotifications(data.notifications || [])
    setCurrentUser(data.currentUser || null)
  }

  const clearAll = () => {
    setToken(null)
    setUsers([])
    setMeta(DEFAULT_META)
    setNotifications([])
    setCurrentUser(null)
  }

  // resolve any existing session on load
  useEffect(() => {
    const token = getToken()
    if (!token) { setInitializing(false); return }
    apiCall('GET', '/state').then(data => {
      if (data.success) applyState(data)
      else clearAll()
      setInitializing(false)
    })
  }, [])

  // ---- auth ----
  const login = async (email, password) => {
    const data = await apiCall('POST', '/auth/login', { email, password })
    if (data.success) {
      localStorage.removeItem('selftrack_dismissed_announcement') // re-show banner each new session
      setToken(data.token)
      applyState(data)
    }
    return data
  }

  const signup = async (username, email, password) => apiCall('POST', '/auth/signup', { username, email, password })

  const createAccount = async ({ username, email, password, role }) => {
    const data = await apiCall('POST', '/users', { username, email, password, role })
    if (data.success) applyState(data)
    return data
  }

  const logout = () => {
    apiCall('POST', '/auth/logout')
    clearAll()
  }

  const resetPassword = async (email, newPassword) => apiCall('POST', '/auth/reset-password', { email, newPassword })

  // ---- points ----
  const addPoints = async (userId, points, category = 'General') => {
    const data = await apiCall('POST', '/points', { userId, points, category })
    if (data.success) applyState(data)
    return data
  }

  const undoAudit = async (auditId) => {
    const data = await apiCall('POST', `/audit/${auditId}/undo`)
    if (data.success) applyState(data)
    return data
  }

  const resetScores = async () => {
    const data = await apiCall('POST', '/admin/reset-scores')
    if (data.success) applyState(data)
    return data
  }

  const endSeason = async (name) => {
    const data = await apiCall('POST', '/admin/end-season', { name })
    if (data.success) applyState(data)
    return data
  }

  // ---- approvals ----
  const approveUser = async (id) => {
    const data = await apiCall('POST', `/users/${id}/approve`)
    if (data.success) applyState(data)
    return data
  }
  const rejectUser = async (id) => {
    const data = await apiCall('POST', `/users/${id}/reject`)
    if (data.success) applyState(data)
    return data
  }
  const deleteUser = async (id) => {
    const data = await apiCall('DELETE', `/users/${id}`)
    if (data.success) applyState(data)
    return data
  }
  const changeUsername = async (id, username) => {
    const data = await apiCall('PATCH', `/users/${id}/username`, { username })
    if (data.success) applyState(data)
    return data
  }
  const setRole = async (id, role) => {
    const data = await apiCall('PATCH', `/users/${id}/role`, { role })
    if (data.success) applyState(data)
    return data
  }
  const changePassword = async (userId, newPassword) => {
    const data = await apiCall('POST', `/users/${userId}/password`, { password: newPassword })
    if (data.success) applyState(data)
    return data
  }
  const setBio = async (userId, bio) => {
    const data = await apiCall('PATCH', `/users/${userId}/bio`, { bio })
    if (data.success) applyState(data)
    return data
  }

  // ---- avatars ----
  const adminSetAvatar = async (userId, dataUrl) => {
    const data = await apiCall('POST', `/users/${userId}/avatar`, { action: 'adminSet', dataUrl })
    if (data.success) applyState(data)
    return data
  }
  const requestAvatarChange = async (userId, dataUrl) => {
    const data = await apiCall('POST', `/users/${userId}/avatar`, { action: 'request', dataUrl })
    if (data.success) applyState(data)
    return data
  }
  const approveAvatar = async (userId) => {
    const data = await apiCall('POST', `/users/${userId}/avatar`, { action: 'approve' })
    if (data.success) applyState(data)
    return data
  }
  const rejectAvatar = async (userId) => {
    const data = await apiCall('POST', `/users/${userId}/avatar`, { action: 'reject' })
    if (data.success) applyState(data)
    return data
  }

  // ---- kudos ----
  const sendKudos = async (targetId, emoji) => {
    if (!currentUser || currentUser.id === targetId) return { success: false }
    const data = await apiCall('POST', '/kudos', { targetId, emoji })
    if (data.success) applyState(data)
    return data
  }

  // ---- meta editors ----
  const updateRewards = async (rewards) => {
    const data = await apiCall('POST', '/meta/rewards', rewards)
    if (data.success) applyState(data)
    return data
  }
  const updateQuote = async (quote) => {
    const data = await apiCall('POST', '/meta/quote', quote)
    if (data.success) applyState(data)
    return data
  }
  const updateResults = async (results) => {
    const data = await apiCall('POST', '/meta/results', results)
    if (data.success) applyState(data)
    return data
  }
  const addWeeklyWinner = async (entry) => {
    const data = await apiCall('POST', '/meta/weekly-winners', entry)
    if (data.success) applyState(data)
    return data
  }
  const removeWeeklyWinner = async (id) => {
    const data = await apiCall('DELETE', `/meta/weekly-winners/${id}`)
    if (data.success) applyState(data)
    return data
  }
  const addCategory = async (name) => {
    const data = await apiCall('POST', '/meta/categories', { name })
    if (data.success) applyState(data)
    return data
  }
  const removeCategory = async (name) => {
    const data = await apiCall('DELETE', `/meta/categories/${encodeURIComponent(name)}`)
    if (data.success) applyState(data)
    return data
  }
  const postAnnouncement = async (text, hours) => {
    const data = await apiCall('POST', '/meta/announcement', { text, hours })
    if (data.success) applyState(data)
    return data
  }
  const clearAnnouncement = async () => {
    const data = await apiCall('DELETE', '/meta/announcement')
    if (data.success) applyState(data)
    return data
  }

  // ---- notifications ----
  const markNotifRead = async (id) => {
    const data = await apiCall('POST', `/notifications/${id}/read`)
    if (data.success) applyState(data)
    return data
  }
  const markAllNotifsRead = async () => {
    const data = await apiCall('POST', '/notifications/read-all')
    if (data.success) applyState(data)
    return data
  }

  // ---- derived collections ----
  // Leaderboard participants: approved, non-admin, non-spectator.
  const approvedUsers = users.filter(u => u.role !== 'admin' && u.role !== 'spectator' && u.status === 'approved')
  const pendingUsers = users.filter(u => u.status === 'pending')
  const pendingAvatarUsers = users.filter(u => u.pendingAvatar)
  const sortedUsers = [...approvedUsers].sort((a, b) => b.score - a.score)

  const getSortedByPeriod = (period, category = 'all') =>
    approvedUsers
      .map(u => ({ ...u, periodScore: pointsInPeriod(u.history, period, category) }))
      .sort((a, b) => b.periodScore - a.periodScore)

  const getWeekRankMap = (offset) => {
    const ranked = approvedUsers
      .map(u => ({ id: u.id, score: pointsInWeekOffset(u.history, offset) }))
      .filter(u => u.score > 0)
      .sort((a, b) => b.score - a.score)
    // Competition ranking — equal scores share a rank (1, 1, 3, ...).
    const map = {}
    ranked.forEach((u, idx) => {
      map[u.id] = idx > 0 && ranked[idx - 1].score === u.score ? map[ranked[idx - 1].id] : idx + 1
    })
    return map
  }

  const isAdmin = currentUser?.role === 'admin'
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'moderator'
  const isSpectator = currentUser?.role === 'spectator'
  // Who is allowed to see spectator accounts. Regular users cannot.
  const canSeeSpectators = ['admin', 'moderator', 'spectator'].includes(currentUser?.role)

  return (
    <AuthContext.Provider
      value={{
        currentUser, users, sortedUsers, approvedUsers, pendingUsers, pendingAvatarUsers,
        meta, notifications, isAdmin, isStaff, isSpectator, canSeeSpectators, initializing,
        login, signup, createAccount, logout, resetPassword,
        addPoints, undoAudit, resetScores, endSeason,
        approveUser, rejectUser, deleteUser, setRole, changeUsername, changePassword, setBio,
        adminSetAvatar, requestAvatarChange, approveAvatar, rejectAvatar,
        sendKudos,
        getSortedByPeriod, getWeekRankMap,
        updateRewards, updateQuote, updateResults, addWeeklyWinner, removeWeeklyWinner,
        addCategory, removeCategory, postAnnouncement, clearAnnouncement,
        markNotifRead, markAllNotifsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
