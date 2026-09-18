import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Compare from './pages/Compare'
import HallOfFame from './pages/HallOfFame'
import Files from './pages/Files'
import ProtectedRoute from './components/ProtectedRoute'
import { TpProvider } from './context/TpContext'
import TpGuard from './components/tp/TpGuard'

// TeamPulse is a second application sharing this shell. Loading it eagerly
// made every SelfTrack page download it, so its screens are split out and
// fetched on first navigation to /tp.
const TpOverview = lazy(() => import('./pages/tp/Overview'))
const TpPeople = lazy(() => import('./pages/tp/People'))
const TpEmployee = lazy(() => import('./pages/tp/Employee'))
const TpPersonForm = lazy(() => import('./pages/tp/PersonForm'))
const TpImport = lazy(() => import('./pages/tp/Import'))
const TpEntries = lazy(() => import('./pages/tp/Entries'))
const TpAudit = lazy(() => import('./pages/tp/Audit'))
const TpTask = lazy(() => import('./pages/tp/Task'))
const TpTaskForm = lazy(() => import('./pages/tp/TaskForm'))
const TpLeaveForm = lazy(() => import('./pages/tp/LeaveForm'))
const TpDelivery = lazy(() => import('./pages/tp/Delivery'))
const TpAttendance = lazy(() => import('./pages/tp/Attendance'))
const TpSkills = lazy(() => import('./pages/tp/Skills'))
const TpEntry = lazy(() => import('./pages/tp/Entry'))
const TpSettings = lazy(() => import('./pages/tp/Settings'))
const TpMobile = lazy(() => import('./pages/tp/Mobile'))
import CommandPalette from './components/CommandPalette'
import AnnouncementBanner from './components/AnnouncementBanner'

function Authed({ children }) {
  return (
    <ProtectedRoute>
      <CommandPalette />
      <AnnouncementBanner />
      {children}
    </ProtectedRoute>
  )
}

export default function App() {
  const { currentUser, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    )
  }

  // Keyed on pathname so every route change replays the enter transition.
  // TeamPulse is keyed as one section instead, so moving between its screens
  // keeps the provider mounted rather than refetching role and config.
  const transitionKey = location.pathname.startsWith('/tp') ? '/tp' : location.pathname

  return (
    <div key={transitionKey} className="page-transition">
      <Routes location={location}>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={currentUser ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/forgot-password" element={currentUser ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/" element={<Authed><Dashboard /></Authed>} />
      <Route path="/profile" element={<Authed><Profile /></Authed>} />
      <Route path="/player/:id" element={<Authed><Profile /></Authed>} />
      <Route path="/compare" element={<Authed><Compare /></Authed>} />
      <Route path="/hall-of-fame" element={<Authed><HallOfFame /></Authed>} />
      <Route path="/files" element={<Authed><Files /></Authed>} />
      <Route path="/settings" element={<Authed><Settings /></Authed>} />

      {/* TeamPulse module. One provider for the whole subtree so role and
          config are fetched once rather than per screen. */}
      <Route path="/tp" element={
        <Authed>
          <TpProvider>
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center" role="status">
                <span className="sr-only">Loading Team Pulse</span>
                <span aria-hidden="true" className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </TpProvider>
        </Authed>
      }>
        <Route index element={<TpOverview />} />
        <Route path="today" element={<TpMobile />} />
        <Route path="people" element={<TpPeople />} />
        <Route path="people/new" element={
          <TpGuard roles={['admin', 'manager']} what="adding people"><TpPersonForm /></TpGuard>
        } />
        <Route path="people/import" element={
          <TpGuard roles={['admin']} what="importing people"><TpImport /></TpGuard>
        } />
        <Route path="people/:id" element={<TpEmployee />} />
        <Route path="people/:id/edit" element={
          <TpGuard roles={['admin', 'manager']} what="editing people"><TpPersonForm /></TpGuard>
        } />
        <Route path="delivery" element={<TpDelivery />} />
        <Route path="attendance" element={
          <TpGuard roles={['admin', 'manager', 'member']} what="attendance"><TpAttendance /></TpGuard>
        } />
        <Route path="leave/new" element={
          <TpGuard roles={['admin', 'manager', 'member']} what="leave requests"><TpLeaveForm /></TpGuard>
        } />
        <Route path="skills" element={<TpSkills />} />
        <Route path="tasks/new" element={
          <TpGuard roles={['admin', 'manager']} what="creating tasks"><TpTaskForm /></TpGuard>
        } />
        <Route path="tasks/:id" element={<TpTask />} />
        <Route path="tasks/:id/edit" element={
          <TpGuard roles={['admin', 'manager']} what="editing tasks"><TpTaskForm /></TpGuard>
        } />
        <Route path="entries" element={<TpEntries />} />
        <Route path="audit" element={
          <TpGuard roles={['admin', 'manager']} what="the audit trail"><TpAudit /></TpGuard>
        } />
        <Route path="entry" element={
          <TpGuard roles={['admin', 'manager']} what="the quick log"><TpEntry /></TpGuard>
        } />
        <Route path="settings" element={
          <TpGuard roles={['admin']} what="Team Pulse settings"><TpSettings /></TpGuard>
        } />
        <Route path="*" element={<Navigate to="/tp" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
