export default function Avatar({ user, className = '' }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt={user?.username || ''} className={`rounded-full object-cover ${className}`} />
  }
  return <span className={className}>{user?.emoji || '👤'}</span>
}
