import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: 'bg-slate-300' }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-green-400', 'bg-green-500']
  return { score, label: labels[score], color: colors[score] }
}

export default function Signup() {
  const { signup } = useAuth()
  const { toast } = useToast()

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  const strength = useMemo(() => passwordStrength(form.password), [form.password])

  const set = (field) => (e) => { setForm(prev => ({ ...prev, [field]: e.target.value })); setError('') }

  const triggerShake = () => setShake(s => s + 1)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const u = form.username.trim()
    const em = form.email.trim()
    if (u.length < 3 || u.length > 20) { triggerShake(); return setError('Username must be 3–20 characters.') }
    if (!/^[a-zA-Z0-9_]+$/.test(u)) { triggerShake(); return setError('Username can only contain letters, numbers, and underscores.') }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { triggerShake(); return setError('Enter a valid email address.') }
    if (form.password.length < 6) { triggerShake(); return setError('Password must be at least 6 characters.') }
    if (form.password !== form.confirm) { triggerShake(); return setError('Passwords do not match.') }

    setLoading(true)
    const result = await signup(u, em, form.password)
    setLoading(false)
    if (result.success) {
      toast('Account created. Awaiting admin approval.', 'success', 4000)
      setPending(true)
    } else {
      triggerShake()
      setError(result.error)
    }
  }

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center animate-scale-in">
          <div className="text-5xl mb-3 animate-float inline-block">⏳</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Account created</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your account is pending admin approval. You'll be able to sign in once approved.
          </p>
          <Link
            to="/login"
            className="inline-block bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm shadow-lg shadow-indigo-500/30 active:scale-95"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <span className="text-5xl inline-block animate-float">🏆</span>
          <h1 className="text-3xl font-extrabold mt-3 shimmer-text">SelfTrack</h1>
          <p className="text-slate-200 mt-1 text-sm">Join the leaderboard. Start climbing.</p>
        </div>

        <div
          key={shake}
          className={`bg-white rounded-2xl shadow-2xl p-8 ${shake > 0 ? 'animate-shake' : ''}`}
        >
          <h2 className="text-xl font-bold text-slate-800 mb-6">Create your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={set('username')}
                placeholder="AwesomePlayer99"
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="Min 6 characters"
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              {form.password && (
                <div className="mt-2 animate-fade-in">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${i <= strength.score ? strength.color : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">{strength.label}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={set('confirm')}
                placeholder="Repeat password"
                className={`w-full border bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  form.confirm && form.confirm !== form.password ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {form.confirm && form.confirm !== form.password && (
                <p className="text-xs text-red-500 mt-1 animate-fade-in">Passwords do not match.</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 animate-slide-down">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm mt-2 shadow-lg shadow-indigo-500/30 hover:shadow-xl active:scale-[0.98]"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
