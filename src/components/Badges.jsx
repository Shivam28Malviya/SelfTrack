// Achievement badge chips + locked/unlocked grid.
import { ACHIEVEMENTS } from '../lib/gamification'

export function BadgeChip({ ach, earned = true, size = 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-base' : 'w-10 h-10 text-xl'
  return (
    <div
      title={`${ach.label} — ${ach.desc}${earned ? '' : ' (locked)'}`}
      className={`${dim} rounded-xl flex items-center justify-center shrink-0 ${
        earned
          ? 'bg-gradient-to-br from-indigo-500/40 to-violet-500/30 border border-indigo-300/40 shadow-md'
          : 'bg-white/5 border border-white/10 grayscale opacity-40'
      }`}
    >
      {ach.icon}
    </div>
  )
}

export function BadgeGrid({ earnedIds }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      {ACHIEVEMENTS.map(a => (
        <div key={a.id} className="flex flex-col items-center gap-1 animate-fade-in">
          <BadgeChip ach={a} earned={earnedIds.includes(a.id)} />
          <span className={`text-[10px] text-center leading-tight ${earnedIds.includes(a.id) ? 'text-slate-200' : 'text-slate-500'}`}>
            {a.label}
          </span>
        </div>
      ))}
    </div>
  )
}
