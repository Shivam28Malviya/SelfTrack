import { useEffect, useRef, useState } from 'react'
import { animateValue, prefersReducedMotion } from '../../lib/motion'

/**
 * A number that counts to its value.
 *
 * Only for figures that are genuinely measured — a KPI, a total. It tells the
 * reader the value was computed rather than printed, and it draws the eye to
 * the number that changed. Null renders the em dash immediately: there is
 * nothing to count to, and animating to "no data" would be nonsense.
 */
export default function CountUp({ value, decimals = 0, duration = 900, className = '', prefix = '', suffix = '' }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const cancelRef = useRef(null)

  useEffect(() => {
    if (value == null) return undefined
    cancelRef.current?.()
    cancelRef.current = animateValue({
      from: 0,
      to: Number(value),
      duration,
      onFrame: setShown,
    })
    return () => cancelRef.current?.()
  }, [value, duration])

  if (value == null) return <span className={className}>—</span>

  return (
    <span className={className}>
      {prefix}{Number(shown).toFixed(decimals)}{suffix}
    </span>
  )
}
