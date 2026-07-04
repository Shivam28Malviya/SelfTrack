// Animated wordmark — letters cascade in one by one (dribbble-style type reveal).
export default function Wordmark({ text = 'SELFTRACK', className = '', stagger = 60, startDelay = 150 }) {
  return (
    <span className={`letter-reveal ${className}`} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} style={{ animationDelay: `${startDelay + i * stagger}ms` }} aria-hidden="true">
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}
