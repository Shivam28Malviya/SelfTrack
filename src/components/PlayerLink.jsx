import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Renders a player's name. Links to their profile unless they're an admin
// (admin profiles are private), a spectator the viewer isn't allowed to see,
// or the record is missing. `self` shows "You".
export default function PlayerLink({ user, self = false, className = '', label }) {
  const { canSeeSpectators } = useAuth()
  const text = label ?? (self ? 'You' : user?.username)

  const isSpectatorHidden = user?.role === 'spectator' && !self && !canSeeSpectators
  // Requires a real user record (id + role) — winner-name fallbacks for
  // deleted users render as plain text instead of a dead link.
  const linkable = user?.id && user.role && user.role !== 'admin' && !isSpectatorHidden

  if (!linkable) return <span className={className}>{text}</span>

  return (
    <Link
      to={`/player/${user.id}`}
      onClick={e => e.stopPropagation()}
      className={`${className} hover:underline decoration-dotted underline-offset-2`}
    >
      {text}
    </Link>
  )
}
