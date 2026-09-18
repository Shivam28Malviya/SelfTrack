import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { TpProvider } from './context/TpContext'
import TpGuard from './components/tp/TpGuard'
import Login from './pages/Login'

// Screens are split so the first paint is the sign-in page rather than the
// whole application.
const Overview = lazy(() => import('./pages/Overview'))
const People = lazy(() => import('./pages/People'))
const Employee = lazy(() => import('./pages/Employee'))
const PersonForm = lazy(() => import('./pages/PersonForm'))
const Import = lazy(() => import('./pages/Import'))
const Entries = lazy(() => import('./pages/Entries'))
const Audit = lazy(() => import('./pages/Audit'))
const Task = lazy(() => import('./pages/Task'))
const TaskForm = lazy(() => import('./pages/TaskForm'))
const LeaveForm = lazy(() => import('./pages/LeaveForm'))
const Delivery = lazy(() => import('./pages/Delivery'))
const Attendance = lazy(() => import('./pages/Attendance'))
const Skills = lazy(() => import('./pages/Skills'))
const Entry = lazy(() => import('./pages/Entry'))
const Settings = lazy(() => import('./pages/Settings'))
const Mobile = lazy(() => import('./pages/Mobile'))

function Spinner({ label }) {
  return (
    <div className="tp min-h-screen grid place-items-center" role="status">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true"
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--tp-line)', borderTopColor: 'var(--tp-navy)' }} />
    </div>
  )
}

/** Everything behind the sign-in page. */
function Authed() {
  const { user, initializing } = useAuth()
  const location = useLocation()
  if (initializing) return <Spinner label="Loading" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return (
    <TpProvider>
      <Suspense fallback={<Spinner label="Loading Team Pulse" />}>
        <Outlet />
      </Suspense>
    </TpProvider>
  )
}

export default function App() {
  const { user, initializing } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        initializing ? <Spinner label="Loading" /> : user ? <Navigate to="/" replace /> : <Login />
      } />

      <Route element={<Authed />}>
        <Route index element={<Overview />} />
        <Route path="today" element={<Mobile />} />
        <Route path="people" element={<People />} />
        <Route path="people/new" element={
          <TpGuard roles={['admin', 'manager']} what="adding people"><PersonForm /></TpGuard>
        } />
        <Route path="people/import" element={
          <TpGuard roles={['admin']} what="importing people"><Import /></TpGuard>
        } />
        <Route path="people/:id" element={<Employee />} />
        <Route path="people/:id/edit" element={
          <TpGuard roles={['admin', 'manager']} what="editing people"><PersonForm /></TpGuard>
        } />
        <Route path="delivery" element={<Delivery />} />
        <Route path="tasks/new" element={
          <TpGuard roles={['admin', 'manager']} what="creating tasks"><TaskForm /></TpGuard>
        } />
        <Route path="tasks/:id" element={<Task />} />
        <Route path="tasks/:id/edit" element={
          <TpGuard roles={['admin', 'manager']} what="editing tasks"><TaskForm /></TpGuard>
        } />
        <Route path="entries" element={<Entries />} />
        <Route path="audit" element={
          <TpGuard roles={['admin', 'manager']} what="the audit trail"><Audit /></TpGuard>
        } />
        <Route path="entry" element={
          <TpGuard roles={['admin', 'manager']} what="the quick log"><Entry /></TpGuard>
        } />
        <Route path="leave/new" element={
          <TpGuard roles={['admin', 'manager', 'member']} what="leave requests"><LeaveForm /></TpGuard>
        } />
        <Route path="attendance" element={
          <TpGuard roles={['admin', 'manager', 'member']} what="attendance"><Attendance /></TpGuard>
        } />
        <Route path="skills" element={<Skills />} />
        <Route path="settings" element={
          <TpGuard roles={['admin']} what="Team Pulse settings"><Settings /></TpGuard>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
