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

  const submit = (e) => {
    e.preventDefault()
    setError('')
    const em = form.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError('Enter a valid email.')
    if (form.next.length < 6) return setError('New password must be at least 6 characters.')
    if (form.next !== form.confirm) return setError('Passwords do not match.')
    const res = resetPassword(em, form.next)
    if (!res.success) return setError(res.error)
    toast('Password reset. You can sign in now.', 'success')
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center animate-scale-in">
          <div className="text-5xl mb-3">🔓</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Password reset</h2>
          <p className="text-slate-500 text-sm mb-6">Use your new password to sign in.</p>
          <Link to="/login" className="inline-block bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm shadow-lg active:scale-95">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <span className="text-5xl inline-block animate-float">🔑</span>
          <h1 className="text-3xl font-extrabold mt-3 shimmer-text">Reset Password</h1>
          <p className="text-slate-200 mt-1 text-sm">Demo flow — resets locally by email.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <input type="email" placeholder="Account email" value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setError('') }}
              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input type="password" placeholder="New password" value={form.next}
              onChange={e => { setForm(p => ({ ...p, next: e.target.value })); setError('') }}
              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input type="password" placeholder="Confirm new password" value={form.confirm}
              onChange={e => { setForm(p => ({ ...p, confirm: e.target.value })); setError('') }}
              className="w-full border border-slate-300 bg-white text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 animate-slide-down"><p className="text-red-600 text-sm">{error}</p></div>}
            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg active:scale-[0.98]">
              Reset password
            </button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-5">
            Remembered it? <Link to="/login" className="text-indigo-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
