import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setBusy(true)
    const res = await login(email.trim(), password)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    navigate('/')
  }

  return (
    <div className="tp min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-[420px] flex flex-col gap-6 tp-rise">
        <div className="text-center">
          <p className="tp-label m-0">Team performance</p>
          <h1 className="tp-h1 mt-2">Team Pulse</h1>
        </div>

        <form className="tp-card tp-rise flex flex-col gap-5" style={{ animationDelay: '90ms' }} onSubmit={submit} noValidate>
          <div>
            <p className="text-xl m-0">Sign in</p>
            <p className="mt-1 m-0 text-sm" style={{ color: 'var(--tp-muted)' }}>
              Delivery, attendance, skills and growth for your team.
            </p>
          </div>

          {error && (
            <p className="m-0 rounded-2xl px-4 py-3 text-sm" role="alert"
              style={{ background: 'var(--tp-bad-bg)', color: 'var(--tp-bad-fg)' }}>
              {error}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Email</span>
            <input className="tp-field" type="email" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="tp-label">Password</span>
            <input className="tp-field" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <button type="submit" className="tp-btn justify-center" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="m-0 text-xs text-center" style={{ color: 'var(--tp-muted)' }}>
            Accounts are created by an administrator with
            {' '}<code>npm run db:admin</code>. There is no self-signup: Team Pulse
            holds attendance and performance records, so access is granted, not requested.
          </p>
        </form>
      </div>
    </div>
  )
}
