import { Link } from 'react-router-dom'

// Renders a player's name. Links to their profile unless they're an admin
// (admin profiles are private) or the record is missing. `self` shows "You".
export default function PlayerLink({ user, self = false, className = '', label }) {
  const text = label ?? (self ? 'You' : user?.username)
  const linkable = user && user.role !== 'admin'

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
