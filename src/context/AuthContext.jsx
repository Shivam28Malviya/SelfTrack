import { createContext, useContext, useState, useEffect } from 'react'

const RANDOM_EMOJIS = ['😎', '🎯', '🔥', '⭐', '🎮', '💡', '🧠', '🎪']

const seedNow = Date.now()
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// build a little spread-out history so charts/heatmap/streaks have data
function seedHistory(total, weeks) {
  const per = Math.round(total / weeks)
  const arr = []
  let remaining = total
  for (let i = weeks - 1; i >= 0; i--) {
    const pts = i === 0 ? remaining : per
    remaining -= pts
    arr.push({ date: seedNow - i * WEEK_MS, points: pts, category: 'General' })
  }
  return arr
}

const SEED_USERS = [
  { id: '1', username: 'Admin', email: 'admin@selftrack.com', password: 'admin123', role: 'admin', status: 'approved', score: 0, emoji: '👑', avatar: '', pendingAvatar: '', bio: 'Keeper of the leaderboard.', stats: { wins: 0 }, history: [], kudos: [] },
  { id: '2', username: 'AlphaWolf', email: 'alpha@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 9850, emoji: '🦊', avatar: '', pendingAvatar: '', bio: 'Lone wolf, top of the pack.', stats: { wins: 12 }, history: seedHistory(9850, 6), kudos: [] },
  { id: '3', username: 'PixelQueen', email: 'pixel@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 8420, emoji: '👸', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 10 }, history: seedHistory(8420, 6), kudos: [] },
  { id: '4', username: 'NeonByte', email: 'neon@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 7190, emoji: '⚡', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 9 }, history: seedHistory(7190, 5), kudos: [] },
  { id: '5', username: 'StarDrift', email: 'star@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 6540, emoji: '🌟', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 8 }, history: seedHistory(6540, 5), kudos: [] },
  { id: '6', username: 'CryptoKid', email: 'crypto@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 5830, emoji: '🚀', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 7 }, history: seedHistory(5830, 4), kudos: [] },
  { id: '7', username: 'IronPulse', email: 'iron@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 4920, emoji: '💪', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 6 }, history: seedHistory(4920, 4), kudos: [] },
  { id: '8', username: 'ShadowFox', email: 'shadow@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 3670, emoji: '🦝', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 5 }, history: seedHistory(3670, 3), kudos: [] },
  { id: '9', username: 'VortexVibe', email: 'vortex@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 2410, emoji: '🌀', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 4 }, history: seedHistory(2410, 3), kudos: [] },
  { id: '10', username: 'MoonRider', email: 'moon@demo.com', password: 'demo123', role: 'user', status: 'approved', score: 1280, emoji: '🌙', avatar: '', pendingAvatar: '', bio: '', stats: { wins: 2 }, history: seedHistory(1280, 2), kudos: [] },
]

const DEFAULT_META = {
  rewards: {
    first: { text: '₹5,000 Bonus + Trophy', image: '' },
    second: { text: '₹2,500 Bonus + Gift Card', image: '' },
  },
  quote: { text: 'Push yourself, because no one else is going to do it for you.', image: '' },
  weeklyWinners: [],
  categories: ['General', 'Sales', 'Training', 'Bonus'],
  announcement: { text: '', until: 0 },
  auditLog: [],   // { id, ts, actorId, actorName, action, userId, userName, points, category, undone }
  seasons: [],    // { id, name, endedAt, podium:[{id,username,emoji,score}] }
}

function startOfWeek(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
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

function normalizeUser(u) {
  return {
    avatar: '', pendingAvatar: '', bio: '', kudos: [],
    ...u,
    stats: { wins: u.stats?.wins ?? 0 },
    history: (u.history || []).map(h => ({ category: 'General', ...h })),
  }
}

function normalizeMeta(m) {
  return { ...DEFAULT_META, ...m }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => {
    const stored = localStorage.getItem('selftrack_users')
    const parsed = stored ? JSON.parse(stored) : SEED_USERS
    return parsed.map(normalizeUser)
  })

  const [meta, setMeta] = useState(() => {
    const stored = localStorage.getItem('selftrack_meta')
    return normalizeMeta(stored ? JSON.parse(stored) : DEFAULT_META)
  })

  const [notifications, setNotifications] = useState(() => {
    const stored = localStorage.getItem('selftrack_notifs')
    return stored ? JSON.parse(stored) : []
  })

  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('selftrack_current')
    return stored ? JSON.parse(stored) : null
  })

  useEffect(() => {
    localStorage.setItem('selftrack_users', JSON.stringify(users))
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id)
      if (updated) setCurrentUser(updated)
    }
  }, [users])

  useEffect(() => { localStorage.setItem('selftrack_meta', JSON.stringify(meta)) }, [meta])
  useEffect(() => { localStorage.setItem('selftrack_notifs', JSON.stringify(notifications)) }, [notifications])

  useEffect(() => {
    if (currentUser) localStorage.setItem('selftrack_current', JSON.stringify(currentUser))
    else localStorage.removeItem('selftrack_current')
  }, [currentUser])

  // ---- notifications helper ----
  const pushNotif = (userId, text, icon = '🔔') =>
    setNotifications(prev => [{ id: Date.now().toString() + Math.random(), userId, text, icon, ts: Date.now(), read: false }, ...prev].slice(0, 200))

  // ---- auth ----
  const login = (email, password) => {
    const user = users.find(u => u.email === email && u.password === password)
    if (!user) return { success: false, error: 'Invalid email or password.' }
    if (user.status === 'pending') return { success: false, error: 'Account pending admin approval.' }
    setCurrentUser(user)
    return { success: true }
  }

  const signup = (username, email, password) => {
    if (users.find(u => u.email === email)) return { success: false, error: 'Email already registered.' }
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return { success: false, error: 'Username already taken.' }
    const newUser = normalizeUser({
      id: Date.now().toString(), username, email, password, role: 'user', status: 'pending',
      score: 0, emoji: RANDOM_EMOJIS[(Math.random() * RANDOM_EMOJIS.length) | 0], stats: { wins: 0 }, history: [],
    })
    setUsers(prev => [...prev, newUser])
    return { success: true, pending: true }
  }

  const createAccount = ({ username, email, password, role }) => {
    if (users.find(u => u.email === email)) return { success: false, error: 'Email already registered.' }
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return { success: false, error: 'Username already taken.' }
    const newUser = normalizeUser({
      id: Date.now().toString(), username, email, password, role, status: 'approved',
      score: 0, emoji: RANDOM_EMOJIS[(Math.random() * RANDOM_EMOJIS.length) | 0], stats: { wins: 0 }, history: [],
    })
    setUsers(prev => [...prev, newUser])
    return { success: true }
  }

  const logout = () => setCurrentUser(null)

  const resetPassword = (email, newPassword) => {
    const user = users.find(u => u.email === email)
    if (!user) return { success: false, error: 'No account with that email.' }
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, password: newPassword } : u)))
    return { success: true }
  }

  // ---- points (with category, notification, audit) ----
  const addPoints = (userId, points, category = 'General') => {
    const target = users.find(u => u.id === userId)
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, score: u.score + points, stats: { wins: u.stats.wins + 1 }, history: [...u.history, { date: Date.now(), points, category }] }
        : u
    ))
    pushNotif(userId, `You received +${points} points (${category}).`, '⭐')
    setMeta(prev => ({
      ...prev,
      auditLog: [{
        id: Date.now().toString() + Math.random(), ts: Date.now(),
        actorId: currentUser?.id, actorName: currentUser?.username || 'System',
        action: 'addPoints', userId, userName: target?.username || '', points, category, undone: false,
      }, ...prev.auditLog].slice(0, 300),
    }))
  }

  const undoAudit = (auditId) => {
    const entry = meta.auditLog.find(a => a.id === auditId)
    if (!entry || entry.undone || entry.action !== 'addPoints') return
    setUsers(prev => prev.map(u => {
      if (u.id !== entry.userId) return u
      // remove the most recent matching history entry
      const idx = [...u.history].reverse().findIndex(h => h.points === entry.points && h.category === entry.category)
      const realIdx = idx === -1 ? -1 : u.history.length - 1 - idx
      const history = realIdx === -1 ? u.history : u.history.filter((_, i) => i !== realIdx)
      return { ...u, score: Math.max(0, u.score - entry.points), stats: { wins: Math.max(0, u.stats.wins - 1) }, history }
    }))
    setMeta(prev => ({ ...prev, auditLog: prev.auditLog.map(a => (a.id === auditId ? { ...a, undone: true } : a)) }))
    pushNotif(entry.userId, `An award of +${entry.points} was reverted.`, '↩️')
  }

  const resetScores = () => {
    setUsers(prev => prev.map(u => ({ ...u, score: 0, stats: { wins: 0 }, history: [] })))
  }

  // ---- season / hall of fame ----
  const endSeason = (name) => {
    const podium = [...users]
      .filter(u => u.role !== 'admin' && u.status === 'approved')
      .sort((a, b) => b.score - a.score).slice(0, 3)
      .map(u => ({ id: u.id, username: u.username, emoji: u.emoji, avatar: u.avatar, score: u.score }))
    setMeta(prev => ({
      ...prev,
      seasons: [{ id: Date.now().toString(), name: name || `Season ${prev.seasons.length + 1}`, endedAt: Date.now(), podium }, ...prev.seasons],
    }))
    resetScores()
  }

  // ---- approvals ----
  const approveUser = (id) => {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, status: 'approved' } : u)))
    pushNotif(id, 'Your account has been approved. Welcome aboard!', '✅')
  }
  const rejectUser = (id) => setUsers(prev => prev.filter(u => u.id !== id))

  const setRole = (id, role) => setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)))

  const changePassword = (userId, newPassword) =>
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, password: newPassword } : u)))

  const setBio = (userId, bio) =>
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, bio } : u)))

  // ---- avatars ----
  const adminSetAvatar = (userId, dataUrl) =>
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, avatar: dataUrl, pendingAvatar: '' } : u)))
  const requestAvatarChange = (userId, dataUrl) =>
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, pendingAvatar: dataUrl } : u)))
  const approveAvatar = (userId) => {
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, avatar: u.pendingAvatar, pendingAvatar: '' } : u)))
    pushNotif(userId, 'Your new profile picture was approved.', '🖼️')
  }
  const rejectAvatar = (userId) => {
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, pendingAvatar: '' } : u)))
    pushNotif(userId, 'Your profile picture request was declined.', '🚫')
  }

  // ---- kudos ----
  const sendKudos = (targetId, emoji) => {
    if (!currentUser || currentUser.id === targetId) return
    setUsers(prev => prev.map(u => {
      if (u.id !== targetId) return u
      const existing = u.kudos.find(k => k.fromId === currentUser.id)
      const kudos = existing
        ? u.kudos.map(k => (k.fromId === currentUser.id ? { ...k, emoji, ts: Date.now() } : k))
        : [...u.kudos, { fromId: currentUser.id, fromName: currentUser.username, emoji, ts: Date.now() }]
      return { ...u, kudos }
    }))
    pushNotif(targetId, `${currentUser.username} sent you ${emoji}`, emoji)
  }

  // ---- meta editors ----
  const updateRewards = (rewards) => setMeta(prev => ({ ...prev, rewards }))
  const updateQuote = (quote) => setMeta(prev => ({ ...prev, quote }))
  const addWeeklyWinner = (entry) => setMeta(prev => ({ ...prev, weeklyWinners: [{ id: Date.now().toString(), ...entry }, ...prev.weeklyWinners] }))
  const removeWeeklyWinner = (id) => setMeta(prev => ({ ...prev, weeklyWinners: prev.weeklyWinners.filter(w => w.id !== id) }))
  const addCategory = (name) => setMeta(prev => prev.categories.includes(name) ? prev : ({ ...prev, categories: [...prev.categories, name] }))
  const removeCategory = (name) => setMeta(prev => ({ ...prev, categories: prev.categories.filter(c => c !== name) }))
  const postAnnouncement = (text, hours) => setMeta(prev => ({ ...prev, announcement: { text, until: Date.now() + hours * 3600 * 1000 } }))
  const clearAnnouncement = () => setMeta(prev => ({ ...prev, announcement: { text: '', until: 0 } }))

  // ---- notifications ----
  const markNotifRead = (id) => setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
  const markAllNotifsRead = () => setNotifications(prev => prev.map(n => (currentUser && n.userId === currentUser.id ? { ...n, read: true } : n)))
  const myNotifications = currentUser ? notifications.filter(n => n.userId === currentUser.id) : []

  // ---- derived collections ----
  const approvedUsers = users.filter(u => u.role !== 'admin' && u.status === 'approved')
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
    const map = {}
    ranked.forEach((u, idx) => { map[u.id] = idx + 1 })
    return map
  }

  const isAdmin = currentUser?.role === 'admin'
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'moderator'

  return (
    <AuthContext.Provider
      value={{
        currentUser, users, sortedUsers, approvedUsers, pendingUsers, pendingAvatarUsers,
        meta, notifications: myNotifications, isAdmin, isStaff,
        login, signup, createAccount, logout, resetPassword,
        addPoints, undoAudit, resetScores, endSeason,
        approveUser, rejectUser, setRole, changePassword, setBio,
        adminSetAvatar, requestAvatarChange, approveAvatar, rejectAvatar,
        sendKudos,
        getSortedByPeriod, getWeekRankMap,
        updateRewards, updateQuote, addWeeklyWinner, removeWeeklyWinner,
        addCategory, removeCategory, postAnnouncement, clearAnnouncement,
        markNotifRead, markAllNotifsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
