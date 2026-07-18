import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

  return (
    // Keyed on pathname so every route change replays the enter transition.
    <div key={location.pathname} className="page-transition">
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
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
