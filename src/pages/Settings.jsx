import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Avatar from '../components/Avatar'
import ConfirmDialog from '../components/ConfirmDialog'
import BarChart from '../components/charts/BarChart'
import { useToast } from '../components/Toast'
import { downloadCsv } from '../lib/csv'

const MAX_IMG_BYTES = 2 * 1024 * 1024 // 2 MB

function ImagePicker({ value, onChange, onError }) {
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onError?.('Please choose an image file.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_IMG_BYTES) {
      onError?.('Image too large. Max 2 MB.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <div className="flex items-center gap-3">
      {value && <img src={value} alt="" className="w-12 h-12 rounded-lg object-cover border border-neutral-200" />}
      <input type="file" accept="image/*" onChange={handleFile} className="text-xs text-neutral-500" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-xs text-red-600 hover:underline">
          Remove
        </button>
      )}
    </div>
  )
}

function PasswordCell({ user, onSave }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (value.length < 6) return setError('Min 6 characters.')
    setSaving(true)
    const result = await onSave(user.id, value)
    setSaving(false)
    if (!result.success) return setError(result.error)
    toast(`Password updated for ${user.username}.`, 'success')
    setError('')
    setValue('')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New password"
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            className="border border-neutral-300 bg-white rounded-lg px-2 py-1 text-xs text-neutral-900 w-32 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-2 py-1 rounded active:scale-95"
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setValue(''); setError('') }}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600 text-xs animate-slide-down">{error}</p>}
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)} className="text-xs text-[#a97e5d] hover:underline">
      Set new password
    </button>
  )
}

// Inline username editor for a user row — admin only.
function UsernameCell({ user, onSave }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user.username)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const u = value.trim()
    if (u.length < 3 || u.length > 20) return setError('3–20 characters.')
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return setError('Letters, numbers, underscores only.')
    if (u === user.username) { setEditing(false); setError(''); return }
    setSaving(true)
    const result = await onSave(user.id, u)
    setSaving(false)
    if (!result.success) return setError(result.error)
    toast(`Username changed to ${u}.`, 'success')
    setError('')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            maxLength={20}
            onChange={e => { setValue(e.target.value); setError('') }}
            className="border border-neutral-300 bg-white rounded-lg px-2 py-1 text-xs text-neutral-900 w-32 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-2 py-1 rounded active:scale-95"
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setValue(user.username); setError('') }}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600 text-xs animate-slide-down">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <p className="font-semibold text-neutral-900 text-sm truncate">{user.username}</p>
      <button
        onClick={() => { setValue(user.username); setEditing(true) }}
        title="Rename user"
        className="text-neutral-400 hover:text-[#a97e5d] text-xs shrink-0"
      >
        ✏️
      </button>
    </div>
  )
}

function Section({ children, delay = 0 }) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="card p-6 animate-slide-up"
    >
      {children}
    </div>
  )
}

// Uppercase divider between groups of related admin sections.
function GroupHeader({ children }) {
  return (
    <div className="pt-4 flex items-center gap-3">
      <h2 className="eyebrow whitespace-nowrap">{children}</h2>
      <div className="h-px flex-1 bg-neutral-300/70" />
    </div>
  )
}

export default function Settings() {
  const {
    currentUser, resetScores, pendingUsers, approveUser, rejectUser,
    pendingAvatarUsers, approveAvatar, rejectAvatar,
    meta, updateRewards, updateQuote, updateResults, addWeeklyWinner, removeWeeklyWinner, users,
    changePassword, changeUsername, createAccount, isAdmin,
    setRole, deleteUser, addCategory, removeCategory, postAnnouncement, clearAnnouncement,
    undoAudit, endSeason, getSortedByPeriod,
  } = useAuth()
  const { toast } = useToast()

  const [notifications, setNotifications] = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmSeason, setConfirmSeason] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null)

  const [rewardsForm, setRewardsForm] = useState(meta.rewards)
  const [quoteForm, setQuoteForm] = useState(meta.quote)
  const [resultsForm, setResultsForm] = useState(meta.results?.text || '')
  const [winnerForm, setWinnerForm] = useState({ week: '', topic: '', winnerId: '' })

  const [newAccount, setNewAccount] = useState({ username: '', email: '', password: '', role: 'user' })
  const [newCategory, setNewCategory] = useState('')
  const [announceForm, setAnnounceForm] = useState({ text: '', hours: 24 })
  const [seasonName, setSeasonName] = useState('')

  const handleReset = () => {
    resetScores()
    setConfirmReset(false)
    toast('All scores have been reset.', 'success')
  }

  const handleEndSeason = () => {
    endSeason(seasonName.trim())
    setConfirmSeason(false)
    setSeasonName('')
    toast('Season archived to Hall of Fame & scores reset.', 'success')
  }

  const submitCategory = (e) => {
    e.preventDefault()
    const c = newCategory.trim()
    if (!c) return
    if (meta.categories.includes(c)) return toast('Category already exists.', 'error')
    addCategory(c)
    setNewCategory('')
    toast('Category added.', 'success')
  }

  const submitAnnouncement = (e) => {
    e.preventDefault()
    if (!announceForm.text.trim()) return toast('Enter announcement text.', 'error')
    const hrs = parseInt(announceForm.hours, 10)
    if (!Number.isFinite(hrs) || hrs <= 0) return toast('Enter valid hours.', 'error')
    postAnnouncement(announceForm.text.trim(), hrs)
    toast('Announcement posted.', 'success')
  }

  const saveRewards = () => { updateRewards(rewardsForm); toast('Monthly rewards saved.', 'success') }
  const saveQuote = () => {
    if (!quoteForm.text.trim()) return toast('Quote text cannot be empty.', 'error')
    updateQuote(quoteForm)
    toast('Quote saved.', 'success')
  }
  const saveResults = () => { updateResults({ text: resultsForm }); toast('Results saved.', 'success') }

  const submitWinner = (e) => {
    e.preventDefault()
    if (!winnerForm.week.trim()) return toast('Enter a week label.', 'error')
    if (!winnerForm.topic.trim()) return toast('Enter a test topic.', 'error')
    if (!winnerForm.winnerId) return toast('Select a winner.', 'error')
    const winner = users.find(u => u.id === winnerForm.winnerId)
    addWeeklyWinner({
      week: winnerForm.week.trim(),
      topic: winnerForm.topic.trim(),
      winnerId: winnerForm.winnerId,
      winnerName: winner?.username || '',
    })
    setWinnerForm({ week: '', topic: '', winnerId: '' })
    toast('Weekly winner added.', 'success')
  }

  const submitNewAccount = async (e) => {
    e.preventDefault()
    const u = newAccount.username.trim()
    const em = newAccount.email.trim()
    if (u.length < 3 || u.length > 20) return toast('Username must be 3–20 characters.', 'error')
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return toast('Username can only contain letters, numbers, underscores.', 'error')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast('Enter a valid email.', 'error')
    if (newAccount.password.length < 6) return toast('Password must be at least 6 characters.', 'error')
    const result = await createAccount({ ...newAccount, username: u, email: em })
    if (result.success) {
      setNewAccount({ username: '', email: '', password: '', role: 'user' })
      toast(`${newAccount.role === 'admin' ? 'Admin' : 'User'} account created.`, 'success')
    } else {
      toast(result.error, 'error')
    }
  }

  const handleApprove = (id, name) => { approveUser(id); toast(`${name} approved.`, 'success') }
  const handleReject = (id, name) => { rejectUser(id); toast(`${name} rejected.`, 'info') }

  const handleDeleteUser = async () => {
    const { username, id } = confirmDeleteUser
    const result = await deleteUser(id)
    setConfirmDeleteUser(null)
    if (result.success) toast(`${username} deleted.`, 'success')
    else toast(result.error, 'error')
  }

  // Eligible weekly-winner picks: approved, scoring participants (no admins/spectators).
  const nonAdminUsers = users.filter(u => u.role !== 'admin' && u.role !== 'spectator' && u.status === 'approved')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-8 space-y-5">
          <div className="animate-slide-down mb-1">
            <span className="eyebrow">/Admin</span>
            <h1 className="display text-5xl text-neutral-900 mt-1">SETTINGS</h1>
          </div>

          {/* ============ YOUR ACCOUNT ============ */}
          <GroupHeader>Your Account</GroupHeader>

          <Section delay={0}>
            <h2 className="font-bold text-neutral-900 mb-4">Preferences</h2>
            <Toggle
              label="Score notifications"
              description="Get notified when your rank changes."
              checked={notifications}
              onChange={setNotifications}
            />
          </Section>

          <Section delay={60}>
            <h2 className="font-bold text-neutral-900 mb-4">Account</h2>
            <div className="space-y-3">
              {[
                { label: 'Username', value: currentUser?.username },
                { label: 'Email', value: currentUser?.email },
                { label: 'Role', value: currentUser?.role },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b last:border-b-0 border-neutral-100">
                  <span className="text-neutral-500 text-sm">{label}</span>
                  <span className="font-medium text-neutral-900 text-sm capitalize">{value}</span>
                </div>
              ))}
            </div>
          </Section>

          {isAdmin && (
            <>
              {/* ============ USER MANAGEMENT ============ */}
              <GroupHeader>User Management</GroupHeader>

              {/* Pending account approvals */}
              <Section delay={100}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-bold text-neutral-900">Pending Approvals</h2>
                  {pendingUsers.length > 0 && (
                    <span className="bg-[#f3ece3] text-[#8a6446] text-xs font-bold px-2 py-0.5 rounded-full animate-pulse-soft">
                      {pendingUsers.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 mb-4">New signups need approval before they can log in.</p>
                {pendingUsers.length === 0 ? (
                  <p className="text-neutral-400 text-sm">No pending requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 animate-slide-up">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} className="w-9 h-9 text-2xl leading-none" />
                          <div>
                            <p className="font-semibold text-neutral-900 text-sm">{u.username}</p>
                            <p className="text-neutral-400 text-xs">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(u.id, u.username)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(u.id, u.username)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Avatar approvals */}
              <Section delay={130}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-bold text-neutral-900">Profile Picture Approvals</h2>
                  {pendingAvatarUsers.length > 0 && (
                    <span className="bg-[#f3ece3] text-[#8a6446] text-xs font-bold px-2 py-0.5 rounded-full animate-pulse-soft">
                      {pendingAvatarUsers.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 mb-4">Users' new profile pictures wait here until approved.</p>
                {pendingAvatarUsers.length === 0 ? (
                  <p className="text-neutral-400 text-sm">No pending photo requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingAvatarUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 animate-slide-up">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} className="w-9 h-9 text-2xl leading-none" />
                          <span className="text-neutral-500 text-xs">→</span>
                          <img src={u.pendingAvatar} alt="new" className="w-9 h-9 rounded-full object-cover ring-2 ring-amber-300/50" />
                          <p className="font-semibold text-neutral-900 text-sm">{u.username}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { approveAvatar(u.id); toast(`${u.username}'s photo approved.`, 'success') }}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { rejectAvatar(u.id); toast(`${u.username}'s photo rejected.`, 'info') }}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Manage users */}
              <Section delay={160}>
                <h2 className="font-bold text-neutral-900 mb-1">Manage Users</h2>
                <p className="text-sm text-neutral-500 mb-4">Rename users (✏️), change roles, set passwords, or delete accounts.</p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {users.filter(u => u.status === 'approved').map(u => (
                    <div key={u.id} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 hover:bg-neutral-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar user={u} className="w-8 h-8 text-xl leading-none ring-1 ring-black/5 shrink-0" />
                        <div className="min-w-0">
                          <UsernameCell user={u} onSave={changeUsername} />
                          <p className="text-neutral-400 text-xs truncate">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={u.role}
                          onChange={e => { setRole(u.id, e.target.value); toast(`${u.username} is now ${e.target.value}.`, 'success') }}
                          disabled={u.id === currentUser.id}
                          title={u.id === currentUser.id ? "Can't change your own role" : 'Change role'}
                          className="border border-neutral-300 bg-white rounded-lg px-2 py-1 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 disabled:opacity-50"
                        >
                          <option value="user" className="bg-white text-slate-900">user</option>
                          <option value="moderator" className="bg-white text-slate-900">moderator</option>
                          <option value="admin" className="bg-white text-slate-900">admin</option>
                          <option value="spectator" className="bg-white text-slate-900">spectator</option>
                        </select>
                        <PasswordCell user={u} onSave={changePassword} />
                        <button
                          onClick={() => setConfirmDeleteUser(u)}
                          disabled={u.id === currentUser.id}
                          title={u.id === currentUser.id ? "Can't delete your own account" : 'Delete user'}
                          className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 font-semibold px-2.5 py-1 rounded-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Create account */}
              <Section delay={190}>
                <h2 className="font-bold text-neutral-900 mb-1">Create Account</h2>
                <p className="text-sm text-neutral-500 mb-4">Create user or admin accounts directly — no approval needed.</p>
                <form onSubmit={submitNewAccount} className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Username (3–20 chars)"
                    value={newAccount.username}
                    onChange={e => setNewAccount(p => ({ ...p, username: e.target.value }))}
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newAccount.email}
                    onChange={e => setNewAccount(p => ({ ...p, email: e.target.value }))}
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Password (min 6)"
                    value={newAccount.password}
                    onChange={e => setNewAccount(p => ({ ...p, password: e.target.value }))}
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    required
                  />
                  <select
                    value={newAccount.role}
                    onChange={e => setNewAccount(p => ({ ...p, role: e.target.value }))}
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  >
                    <option value="user" className="bg-white text-slate-900">User</option>
                    <option value="moderator" className="bg-white text-slate-900">Moderator</option>
                    <option value="admin" className="bg-white text-slate-900">Admin</option>
                    <option value="spectator" className="bg-white text-slate-900">Spectator</option>
                  </select>
                  <button
                    type="submit"
                    className="col-span-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-2 rounded-lg text-sm active:scale-[0.98]"
                  >
                    Create Account
                  </button>
                </form>
                <p className="text-xs text-neutral-400 mt-2">Moderators can award points but cannot create accounts or change settings.</p>
              </Section>

              {/* ============ LEADERBOARD CONTENT ============ */}
              <GroupHeader>Leaderboard Content</GroupHeader>

              {/* Announcements */}
              <Section delay={220}>
                <h2 className="font-bold text-neutral-900 mb-1">Announcement Banner</h2>
                <p className="text-sm text-neutral-500 mb-4">Show a banner to everyone for a set number of hours.</p>
                <form onSubmit={submitAnnouncement} className="space-y-2">
                  <input
                    type="text" maxLength={120} value={announceForm.text}
                    onChange={e => setAnnounceForm(p => ({ ...p, text: e.target.value }))}
                    placeholder="Announcement message…"
                    className="w-full border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number" min="1" max="720" value={announceForm.hours}
                      onChange={e => setAnnounceForm(p => ({ ...p, hours: e.target.value }))}
                      className="w-28 border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    />
                    <span className="text-neutral-500 text-sm self-center">hours visible</span>
                    <button type="submit" className="ml-auto bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-95">Post</button>
                    {meta.announcement?.text && meta.announcement.until > Date.now() && (
                      <button type="button" onClick={() => { clearAnnouncement(); toast('Announcement cleared.', 'info') }}
                        className="bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-semibold px-4 py-2 rounded-lg text-sm">Clear</button>
                    )}
                  </div>
                </form>
              </Section>

              {/* Weekly winners */}
              <Section delay={250}>
                <h2 className="font-bold text-neutral-900 mb-4">Weekly Winners</h2>
                <form onSubmit={submitWinner} className="grid grid-cols-2 gap-2 mb-4">
                  <input
                    type="text"
                    maxLength={30}
                    value={winnerForm.week}
                    onChange={e => setWinnerForm(p => ({ ...p, week: e.target.value }))}
                    placeholder="Week label (e.g. Week 1)"
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  />
                  <select
                    value={winnerForm.winnerId}
                    onChange={e => setWinnerForm(p => ({ ...p, winnerId: e.target.value }))}
                    className="border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  >
                    <option value="" className="bg-white text-slate-900">Select winner…</option>
                    {nonAdminUsers.map(u => (
                      <option key={u.id} value={u.id} className="bg-white text-slate-900">{u.username}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={60}
                    value={winnerForm.topic}
                    onChange={e => setWinnerForm(p => ({ ...p, topic: e.target.value }))}
                    placeholder="Test topic"
                    className="col-span-2 border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  />
                  <button
                    type="submit"
                    className="col-span-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-2 rounded-lg text-sm shadow-md active:scale-[0.98]"
                  >
                    Add Winner
                  </button>
                </form>

                {meta.weeklyWinners.length > 0 && (
                  <div className="space-y-2">
                    {meta.weeklyWinners.map(w => (
                      <div key={w.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2 hover:bg-neutral-100 animate-slide-up">
                        <div className="text-sm">
                          <span className="font-semibold text-neutral-900">{w.week}</span>
                          <span className="text-neutral-500"> — {w.winnerName} · {w.topic}</span>
                        </div>
                        <button
                          onClick={() => { removeWeeklyWinner(w.id); toast(`Removed "${w.week}".`, 'info') }}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Results */}
              <Section delay={280}>
                <h2 className="font-bold text-neutral-900 mb-1">Results</h2>
                <p className="text-sm text-neutral-500 mb-4">Shown in the right panel; users see a 4-line preview and can expand the full text in a popup.</p>
                <textarea
                  value={resultsForm}
                  onChange={e => setResultsForm(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  placeholder="Enter results / detailed announcement…"
                  className="w-full border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 mb-1 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 resize-y"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{resultsForm.length}/4000</span>
                  <button
                    onClick={saveResults}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md active:scale-95"
                  >
                    Save Results
                  </button>
                </div>
              </Section>

              {/* Monthly rewards */}
              <Section delay={310}>
                <h2 className="font-bold text-neutral-900 mb-4">Monthly Rewards</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">1st Place</label>
                    <input
                      type="text"
                      maxLength={80}
                      value={rewardsForm.first.text}
                      onChange={e => setRewardsForm(p => ({ ...p, first: { ...p.first, text: e.target.value } }))}
                      placeholder="e.g. ₹5,000 Bonus + Trophy"
                      className="w-full border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 mb-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    />
                    <ImagePicker
                      value={rewardsForm.first.image}
                      onChange={img => setRewardsForm(p => ({ ...p, first: { ...p.first, image: img } }))}
                      onError={msg => toast(msg, 'error')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">2nd Place</label>
                    <input
                      type="text"
                      maxLength={80}
                      value={rewardsForm.second.text}
                      onChange={e => setRewardsForm(p => ({ ...p, second: { ...p.second, text: e.target.value } }))}
                      placeholder="e.g. ₹2,500 Bonus"
                      className="w-full border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 mb-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                    />
                    <ImagePicker
                      value={rewardsForm.second.image}
                      onChange={img => setRewardsForm(p => ({ ...p, second: { ...p.second, image: img } }))}
                      onError={msg => toast(msg, 'error')}
                    />
                  </div>
                  <button
                    onClick={saveRewards}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md active:scale-95"
                  >
                    Save Rewards
                  </button>
                </div>
              </Section>

              {/* Motivational quote */}
              <Section delay={340}>
                <h2 className="font-bold text-neutral-900 mb-4">Motivational Quote</h2>
                <textarea
                  value={quoteForm.text}
                  onChange={e => setQuoteForm(p => ({ ...p, text: e.target.value }))}
                  rows={2}
                  maxLength={200}
                  placeholder="Enter quote…"
                  className="w-full border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 mb-1 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 resize-none"
                />
                <p className="text-xs text-neutral-400 mb-2 text-right">{quoteForm.text.length}/200</p>
                <ImagePicker
                  value={quoteForm.image}
                  onChange={img => setQuoteForm(p => ({ ...p, image: img }))}
                  onError={msg => toast(msg, 'error')}
                />
                <button
                  onClick={saveQuote}
                  className="mt-3 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md active:scale-95"
                >
                  Save Quote
                </button>
              </Section>

              {/* Point categories */}
              <Section delay={370}>
                <h2 className="font-bold text-neutral-900 mb-1">Point Categories</h2>
                <p className="text-sm text-neutral-500 mb-4">Used when awarding points.</p>
                <form onSubmit={submitCategory} className="flex gap-2 mb-3">
                  <input
                    type="text" maxLength={20} value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="New category…"
                    className="flex-1 border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  />
                  <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-95">Add</button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {meta.categories.map(c => (
                    <span key={c} className="inline-flex items-center gap-1.5 bg-neutral-100 border border-neutral-200 rounded-full pl-3 pr-1.5 py-1 text-sm text-neutral-900">
                      {c}
                      <button
                        onClick={() => { removeCategory(c); toast(`Removed "${c}".`, 'info') }}
                        className="w-5 h-5 rounded-full hover:bg-red-500/30 text-red-600 text-xs flex items-center justify-center"
                        title="Remove"
                      >×</button>
                    </span>
                  ))}
                </div>
              </Section>

              {/* ============ DATA & SEASON ============ */}
              <GroupHeader>Data &amp; Season</GroupHeader>

              {/* Leaderboard distribution */}
              <Section delay={400}>
                <h2 className="font-bold text-neutral-900 mb-4">Score Distribution (All-Time Top 10)</h2>
                <BarChart
                  data={getSortedByPeriod('all').slice(0, 10).map(u => ({ label: u.username.slice(0, 6), value: u.score }))}
                />
              </Section>

              {/* Audit log */}
              <Section delay={430}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-neutral-900">Audit Log</h2>
                  <button
                    onClick={() => {
                      const rows = meta.auditLog.map(a => [new Date(a.ts).toLocaleString(), a.actorName, a.action, a.userName, a.points, a.category, a.undone ? 'undone' : 'active'])
                      downloadCsv('audit-log.csv', rows, ['When', 'Actor', 'Action', 'User', 'Points', 'Category', 'Status'])
                    }}
                    className="text-xs bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-900 px-3 py-1.5 rounded-lg"
                  >⬇ Export</button>
                </div>
                {meta.auditLog.length === 0 ? (
                  <p className="text-neutral-400 text-sm">No actions logged yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {meta.auditLog.slice(0, 50).map(a => (
                      <div key={a.id} className={`flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2 text-xs ${a.undone ? 'opacity-50' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-neutral-900 truncate">
                            <span className="font-semibold">{a.actorName}</span> awarded{' '}
                            <span className="text-green-600 font-semibold">+{a.points}</span> ({a.category}) to{' '}
                            <span className="font-semibold">{a.userName}</span>
                          </p>
                          <p className="text-neutral-400">{new Date(a.ts).toLocaleString()}</p>
                        </div>
                        {a.undone ? (
                          <span className="text-neutral-400 shrink-0">undone</span>
                        ) : (
                          <button
                            onClick={() => { undoAudit(a.id); toast('Award reverted.', 'info') }}
                            className="text-[#a97e5d] hover:underline shrink-0"
                          >Undo</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Season control */}
              <Section delay={460}>
                <h2 className="font-bold text-neutral-900 mb-1">End Season</h2>
                <p className="text-sm text-neutral-500 mb-3">Archive the current top 3 to the Hall of Fame, then reset all scores for a fresh season.</p>
                <div className="flex gap-2">
                  <input
                    type="text" maxLength={30} value={seasonName}
                    onChange={e => setSeasonName(e.target.value)}
                    placeholder="Season name (optional)"
                    className="flex-1 border border-neutral-300 bg-white rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15"
                  />
                  <button
                    onClick={() => setConfirmSeason(true)}
                    className="bg-amber-500/80 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-95"
                  >End Season</button>
                </div>
              </Section>

              {/* Danger zone */}
              <Section delay={490}>
                <h2 className="font-bold text-red-600 mb-2">Danger Zone</h2>
                <p className="text-sm text-neutral-500 mb-4">
                  Reset all player scores to zero. This cannot be undone.
                </p>
                <button
                  onClick={() => setConfirmReset(true)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 font-semibold px-4 py-2 rounded-lg text-sm active:scale-95"
                >
                  Reset all scores
                </button>
              </Section>
            </>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={confirmSeason}
        title="End the season?"
        message="Current top 3 will be archived to the Hall of Fame and all scores reset to zero."
        confirmLabel="End season"
        danger
        onConfirm={handleEndSeason}
        onCancel={() => setConfirmSeason(false)}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset all scores?"
        message="Every player's score, win count, and history will be cleared. This cannot be undone."
        confirmLabel="Reset all"
        danger
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={!!confirmDeleteUser}
        title={`Delete ${confirmDeleteUser?.username}?`}
        message="This permanently removes the account, score, history, and notifications. This cannot be undone."
        confirmLabel="Delete user"
        danger
        onConfirm={handleDeleteUser}
        onCancel={() => setConfirmDeleteUser(null)}
      />
    </div>
  )
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`w-11 h-6 rounded-full relative ${checked ? 'bg-neutral-900' : 'bg-neutral-300'}`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow ${checked ? 'translate-x-6' : 'translate-x-1'}`}
          style={{ transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </button>
    </div>
  )
}
