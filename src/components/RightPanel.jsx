import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import Modal from './Modal'
import PlayerLink from './PlayerLink'

function RewardCard({ place, data, delay }) {
  if (!data?.text && !data?.image) return null
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 bg-[#f3ece3] border border-[#e0cdb6] animate-slide-up hover:scale-[1.02]"
    >
      {data.image ? (
        <img src={data.image} alt={place} className="w-10 h-10 rounded-lg object-cover shrink-0" />
      ) : (
        <span className="text-2xl shrink-0">{place === 'first' ? '🥇' : '🥈'}</span>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#a97e5d]">
          {place === 'first' ? '1st Place' : '2nd Place'}
        </p>
        <p className="text-sm font-semibold text-neutral-800 truncate">{data.text}</p>
      </div>
    </div>
  )
}

export default function RightPanel({ inline = false }) {
  const { meta, users } = useAuth()
  const { rewards, quote, results, weeklyWinners } = meta
  const [showResults, setShowResults] = useState(false)

  const resultsText = results?.text || ''

  // `inline` mode is used to surface the same content below the leaderboard
  // on small screens, where the fixed side panel is hidden.
  const Tag = inline ? 'div' : 'aside'
  const wrapperClass = inline
    ? 'w-full space-y-7'
    : 'hidden xl:block w-80 shrink-0 border-l border-neutral-200 bg-white overflow-y-auto px-5 py-8 space-y-7 animate-slide-in-right'

  return (
    <Tag className={wrapperClass}>
      {/* Monthly Rewards */}
      <section>
        <h3 className="eyebrow mb-3">🎁 Monthly Rewards</h3>
        <div className="space-y-2">
          <RewardCard place="first" data={rewards.first} delay={100} />
          <RewardCard place="second" data={rewards.second} delay={180} />
        </div>
      </section>

      {/* Weekly Winners */}
      <section>
        <h3 className="eyebrow mb-3">🏅 Weekly Winners</h3>
        {weeklyWinners.length === 0 ? (
          <p className="text-neutral-400 text-sm">No winners recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {weeklyWinners.map((w, i) => {
              const winnerUser = users.find(u => u.id === w.winnerId)
              return (
                <div
                  key={w.id}
                  style={{ animationDelay: `${i * 60 + 260}ms` }}
                  className="flex items-center justify-between gap-3 bg-neutral-50 rounded-2xl px-3 py-2.5 border border-neutral-200 animate-slide-up hover:bg-neutral-100 hover:scale-[1.02]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#a97e5d]">{w.week}</p>
                    <p className="text-base font-extrabold text-neutral-900 truncate">
                      <PlayerLink user={winnerUser} label={winnerUser?.username || w.winnerName} className="text-neutral-900" />
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      <span className="font-semibold text-neutral-700">Topic:</span> {w.topic}
                    </p>
                  </div>
                  <Avatar
                    user={winnerUser || { emoji: '🏅' }}
                    className="w-10 h-10 text-2xl leading-none shrink-0 ring-2 ring-[#e0cdb6]"
                  />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Results */}
      {resultsText && (
        <section className="pt-5 border-t border-neutral-200">
          <h3 className="eyebrow mb-3">📊 Results</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 animate-slide-up">
            <p className="text-sm text-neutral-700 leading-snug whitespace-pre-wrap line-clamp-4">{resultsText}</p>
            <button
              onClick={() => setShowResults(true)}
              className="mt-2 text-xs font-semibold text-[#a97e5d] hover:underline"
            >
              Read full results →
            </button>
          </div>
        </section>
      )}

      {/* Motivational Quote */}
      {quote.text && (
        <section className="pt-5 border-t border-neutral-200">
          <div className="card-dark p-4 animate-slide-up">
            {quote.image && (
              <img src={quote.image} alt="quote" className="w-full h-28 object-cover rounded-lg mb-3" />
            )}
            <p className="text-sm font-medium leading-snug text-neutral-100">&ldquo;{quote.text}&rdquo;</p>
          </div>
        </section>
      )}

      {showResults && (
        <Modal title="📊 Results" onClose={() => setShowResults(false)}>
          <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{resultsText}</p>
        </Modal>
      )}
    </Tag>
  )
}
