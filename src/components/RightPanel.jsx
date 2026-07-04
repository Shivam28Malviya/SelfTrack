import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'

function RewardCard({ place, data, color, delay }) {
  if (!data?.text && !data?.image) return null
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border backdrop-blur-md animate-slide-up hover:scale-[1.02] ${color}`}
    >
      {data.image ? (
        <img src={data.image} alt={place} className="w-10 h-10 rounded-lg object-cover shrink-0" />
      ) : (
        <span className="text-2xl shrink-0">{place === 'first' ? '🥇' : '🥈'}</span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide opacity-80">
          {place === 'first' ? '1st Place' : '2nd Place'}
        </p>
        <p className="text-sm font-semibold truncate">{data.text}</p>
      </div>
    </div>
  )
}

export default function RightPanel() {
  const { meta, users } = useAuth()
  const { rewards, quote, weeklyWinners } = meta

  return (
    <aside className="hidden xl:block w-80 shrink-0 border-l border-white/10 bg-white/10 backdrop-blur-lg overflow-y-auto px-5 py-8 space-y-6 animate-slide-in-right">
      {/* Monthly Rewards */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Monthly Rewards</h3>
        <div className="space-y-2">
          <RewardCard place="first" data={rewards.first} color="bg-amber-300/15 border-amber-200/30 text-amber-50" delay={100} />
          <RewardCard place="second" data={rewards.second} color="bg-slate-200/10 border-slate-200/25 text-slate-50" delay={180} />
        </div>
      </section>

      {/* Weekly Winners */}
      <section>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Weekly Winners</h3>
        {weeklyWinners.length === 0 ? (
          <p className="text-slate-300 text-sm">No winners recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {weeklyWinners.map((w, i) => {
              const winnerUser = users.find(u => u.id === w.winnerId)
              return (
                <div
                  key={w.id}
                  style={{ animationDelay: `${i * 60 + 260}ms` }}
                  className="flex items-center justify-between gap-3 bg-indigo-500/15 backdrop-blur-md rounded-xl px-3 py-2.5 border border-indigo-200/25 animate-slide-up hover:bg-indigo-500/25 hover:scale-[1.02]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-indigo-100">{w.week}</p>
                    <p className="text-sm font-semibold text-white truncate">{winnerUser?.username || w.winnerName}</p>
                    <p className="text-xs text-slate-300 truncate">{w.topic}</p>
                  </div>
                  <Avatar
                    user={winnerUser || { emoji: '🏅' }}
                    className="w-10 h-10 text-2xl leading-none shrink-0 ring-2 ring-amber-300/40"
                  />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Motivational Quote */}
      {quote.text && (
        <section className="pt-4 mt-2 border-t border-white/10">
          <div className="bg-gradient-to-br from-indigo-600/70 to-violet-600/70 backdrop-blur-md rounded-2xl p-4 text-white border border-white/10 animate-slide-up shadow-xl shadow-indigo-500/20" style={{ animationDelay: '400ms' }}>
            {quote.image && (
              <img src={quote.image} alt="quote" className="w-full h-28 object-cover rounded-lg mb-3" />
            )}
            <p className="text-sm font-medium leading-snug">&ldquo;{quote.text}&rdquo;</p>
          </div>
        </section>
      )}
    </aside>
  )
}
