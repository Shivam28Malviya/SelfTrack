import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const triggerShake = () => setShake(s => s + 1)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const trimmedEmail = email.trim()
    if (!trimmedEmail) { triggerShake(); return setError('Email is required.') }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { triggerShake(); return setError('Enter a valid email address.') }
    if (!password) { triggerShake(); return setError('Password is required.') }

    setLoading(true)
    const result = await login(trimmedEmail, password)
    setLoading(false)
    if (result.success) {
      setSuccess(true)
      toast(`Welcome back!`, 'success')
      await new Promise(r => setTimeout(r, 550))
      navigate('/')
    } else {
      triggerShake()
      setError(result.error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl inline-block animate-float">🏆</span>
          <h1 className="text-3xl font-extrabold mt-3 shimmer-text">SelfTrack</h1>
          <p className="text-slate-200 mt-1 text-sm">Compete. Improve. Dominate.</p>
        </div>

        <div
          key={shake}
          className={`bg-white rounded-2xl shadow-2xl p-8 transition-shadow duration-300 ${shake > 0 ? 'animate-shake' : ''} ${success ? 'ring-4 ring-green-400/60 shadow-green-500/20' : ''}`}
        >
          <h2 className="text-xl font-bold text-slate-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 animate-slide-down">
                <p className="text-red-600 text-sm">✕ {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 animate-slide-down">
                <p className="text-green-600 text-sm font-medium">✓ Signed in! Taking you to your dashboard…</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className={`w-full text-white font-semibold py-2.5 rounded-lg text-sm mt-2 shadow-lg active:scale-[0.98] disabled:cursor-not-allowed ${
                success
                  ? 'bg-green-500 shadow-green-500/30'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40'
              }`}
            >
              {success ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="animate-pop">✓</span> Signed in
                </span>
              ) : loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="text-center text-sm text-slate-500 mt-5 space-y-1">
            <p>
              <Link to="/forgot-password" className="text-indigo-600 font-medium hover:underline">
                Forgot password?
              </Link>
            </p>
            <p>
              No account?{' '}
              <Link to="/signup" className="text-indigo-600 font-medium hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
