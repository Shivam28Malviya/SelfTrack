import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Wordmark from '../components/Wordmark'

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      {/* Editorial wordmark */}
      <div className="w-full max-w-md mb-6 text-center animate-slide-up">
        <span className="eyebrow">Gamified progress</span>
        <h1 className="display text-6xl sm:text-7xl text-neutral-900 mt-2">
          <Wordmark text="SELFTRACK" />
        </h1>
      </div>

      <div className="w-full max-w-md animate-slide-up">
        <div
          key={shake}
          className={`card p-8 transition-shadow duration-300 ${shake > 0 ? 'animate-shake' : ''} ${success ? 'ring-2 ring-[#a97e5d]' : ''}`}
        >
          <h2 className="text-lg font-bold text-neutral-900 mb-1">Welcome back</h2>
          <p className="text-sm text-neutral-500 mb-6">Sign in to your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase text-neutral-500 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                className="field"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase text-neutral-500 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                className="field"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 animate-slide-down">
                <p className="text-red-600 text-sm">✕ {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-[#f2ede6] border border-[#d8c7b3] rounded-xl px-4 py-2.5 animate-slide-down">
                <p className="text-[#8a6446] text-sm font-medium">✓ Signed in! Taking you to your dashboard…</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className={`w-full rounded-full py-3 text-sm font-semibold mt-2 active:scale-[0.98] disabled:cursor-not-allowed ${
                success
                  ? 'bg-[#a97e5d] text-white'
                  : 'bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-60'
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
                'Sign in  ↗'
              )}
            </button>
          </form>

          <div className="text-center text-sm text-neutral-500 mt-5 space-y-1">
            <p>
              <Link to="/forgot-password" className="text-[#a97e5d] font-medium hover:underline">
                Forgot password?
              </Link>
            </p>
            <p>
              No account?{' '}
              <Link to="/signup" className="text-neutral-900 font-semibold hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
