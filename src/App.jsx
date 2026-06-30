import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Compare from './pages/Compare'
import HallOfFame from './pages/HallOfFame'
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
  const { currentUser } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={currentUser ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/forgot-password" element={currentUser ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/" element={<Authed><Dashboard /></Authed>} />
      <Route path="/profile" element={<Authed><Profile /></Authed>} />
      <Route path="/compare" element={<Authed><Compare /></Authed>} />
      <Route path="/hall-of-fame" element={<Authed><HallOfFame /></Authed>} />
      <Route path="/settings" element={<Authed><Settings /></Authed>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
