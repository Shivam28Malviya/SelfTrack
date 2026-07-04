import { useAuth } from '../context/AuthContext'

const KUDOS_EMOJIS = ['👏', '🔥', '💪', '🚀', '🎉']

export default function KudosBar({ user }) {
  const { currentUser, sendKudos } = useAuth()
  if (!user) return null
  const isSelf = currentUser?.id === user.id
  const myKudo = user.kudos?.find(k => k.fromId === currentUser?.id)

  // tally counts per emoji
  const counts = {}
  for (const k of user.kudos || []) counts[k.emoji] = (counts[k.emoji] || 0) + 1
  const total = user.kudos?.length || 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1">
        {KUDOS_EMOJIS.map(e => (
          <button
            key={e}
            disabled={isSelf}
            onClick={() => sendKudos(user.id, e)}
            className={`w-8 h-8 rounded-lg text-base flex items-center justify-center active:scale-90 ${
              myKudo?.emoji === e
                ? 'bg-[#a97e5d]/25 border border-[#cbb39c]'
                : 'bg-white hover:bg-neutral-100 border border-neutral-200'
            } ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={isSelf ? "Can't kudos yourself" : `Send ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      {total > 0 && (
        <span className="text-xs text-neutral-500">
          {total} {total === 1 ? 'kudo' : 'kudos'}
          {Object.entries(counts).map(([e, c]) => ` ${e}${c}`).join('')}
        </span>
      )}
    </div>
  )
}
