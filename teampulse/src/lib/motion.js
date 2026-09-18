/**
 * Motion helpers.
 *
 * Everything here checks `prefers-reduced-motion` itself. The stylesheet
 * disables CSS animation under that query, but a JavaScript animation would
 * happily keep running — a number counting up is still motion, and someone who
 * has asked the system for less of it should get the final value immediately.
 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Ease-out-expo: fast at the start, settling at the end. Matches --tp-ease. */
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

/**
 * Runs `onFrame(value)` from `from` to `to` over `duration`.
 * Returns a cancel function; callers cancel on unmount so a value that changes
 * mid-flight does not leave two animations fighting over the same number.
 */
export function animateValue({ from, to, duration = 900, onFrame, onDone }) {
  if (prefersReducedMotion() || from === to || typeof requestAnimationFrame !== 'function') {
    onFrame(to)
    onDone?.()
    return () => {}
  }

  let raf = null
  const start = performance.now()

  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration)
    onFrame(from + (to - from) * easeOutExpo(progress))
    if (progress < 1) raf = requestAnimationFrame(tick)
    else onDone?.()
  }

  raf = requestAnimationFrame(tick)
  return () => { if (raf) cancelAnimationFrame(raf) }
}

/** A per-item delay for staggered entrances, capped so a long list does not
 *  take seconds to finish arriving. */
export const stagger = (index, step = 45, max = 320) =>
  prefersReducedMotion() ? 0 : Math.min(index * step, max)
