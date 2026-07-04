import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState({ email: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const em = form.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError('Enter a valid email.')
    if (form.next.length < 6) return setError('New password must be at least 6 characters.')
    if (form.next !== form.confirm) return setError('Passwords do not match.')
    const res = await resetPassword(em, form.next)
    if (!res.success) return setError(res.error)
    toast('Password reset. You can sign in now.', 'success')
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-8 text-center animate-scale-in">
          <div className="text-5xl mb-3">🔓</div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Password reset</h2>
          <p className="text-neutral-500 text-sm mb-6">Use your new password to sign in.</p>
          <Link to="/login" className="btn-dark">Back to sign in  ↗</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-6">
          <span className="eyebrow">Account recovery</span>
          <h1 className="display text-5xl sm:text-6xl text-neutral-900 mt-2">RESET</h1>
          <p className="text-neutral-500 mt-2 text-sm">Enter your account email and a new password.</p>
        </div>
        <div className="card p-8">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <input type="email" placeholder="Account email" value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setError('') }}
              className="field" />
            <input type="password" placeholder="New password" value={form.next}
              onChange={e => { setForm(p => ({ ...p, next: e.target.value })); setError('') }}
              className="field" />
            <input type="password" placeholder="Confirm new password" value={form.confirm}
              onChange={e => { setForm(p => ({ ...p, confirm: e.target.value })); setError('') }}
              className="field" />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 animate-slide-down"><p className="text-red-600 text-sm">{error}</p></div>}
            <button type="submit" className="w-full bg-neutral-900 text-white hover:bg-neutral-800 font-semibold py-3 rounded-full text-sm active:scale-[0.98]">
              Reset password  ↗
            </button>
          </form>
          <p className="text-center text-sm text-neutral-500 mt-5">
            Remembered it? <Link to="/login" className="text-neutral-900 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
