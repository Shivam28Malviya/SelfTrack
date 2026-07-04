import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import RightPanel from '../components/RightPanel'
import Avatar from '../components/Avatar'

const MEDAL = ['🥇', '🥈', '🥉']

export default function HallOfFame() {
  const { meta } = useAuth()
  const seasons = meta.seasons || []

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-8 animate-slide-up">
          <span className="eyebrow">/Archive</span>
          <h1 className="display text-5xl text-neutral-900 mt-1 mb-1">HALL OF FAME</h1>
          <p className="text-neutral-500 mb-6">Champions of past seasons.</p>

          {seasons.length === 0 ? (
            <div className="text-center py-20 text-neutral-400 animate-fade-in">
              <div className="text-5xl mb-3 animate-float inline-block">🏆</div>
              <p className="font-medium">No seasons archived yet.</p>
              <p className="text-sm text-neutral-400 mt-1">Admins can end a season in Settings to snapshot the podium here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {seasons.map((s, si) => (
                <div key={s.id} className="card p-5 animate-slide-up" style={{ animationDelay: `${si * 80}ms` }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-neutral-900">{s.name}</h2>
                    <span className="text-xs text-neutral-400">{new Date(s.endedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {s.podium.map((p, i) => (
                      <div key={p.id} className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 text-center">
                        <div className="text-2xl mb-1">{MEDAL[i]}</div>
                        <Avatar user={p} className="w-12 h-12 text-3xl mx-auto block ring-2 ring-black/5" />
                        <p className="text-neutral-900 font-semibold text-sm mt-2 truncate">{p.username}</p>
                        <p className="text-[#8a6446] text-xs">{p.score.toLocaleString()} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <RightPanel />
    </div>
  )
}
