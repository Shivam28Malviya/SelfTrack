// Tiny Web Audio SFX — no asset files, no deps. Respects mute flag in localStorage.
let ctx = null
function audioCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function isMuted() {
  return localStorage.getItem('selftrack_muted') === '1'
}
export function setMuted(v) {
  localStorage.setItem('selftrack_muted', v ? '1' : '0')
}

function tone(freq, start, dur, type = 'sine', gain = 0.08) {
  const ac = audioCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + start)
  g.gain.setValueAtTime(gain, ac.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur)
}

export function playPoints() {
  if (isMuted()) return
  tone(523.25, 0, 0.12, 'triangle')
  tone(659.25, 0.08, 0.14, 'triangle')
}
export function playLevelUp() {
  if (isMuted()) return
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.18, 'sawtooth', 0.06))
}
export function playClick() {
  if (isMuted()) return
  tone(880, 0, 0.05, 'square', 0.03)
}
