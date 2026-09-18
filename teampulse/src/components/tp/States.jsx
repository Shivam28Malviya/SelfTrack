// The four states every TeamPulse screen needs and the design export had none
// of: loading, empty, error, and no-access.

export function TpLoading({ label = 'Loading', rows = 3 }) {
  return (
    <div className="tp-card" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="tp-skeleton h-4 rounded-full" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  )
}

export function TpEmpty({ title = 'Nothing here yet', body, action }) {
  return (
    <div className="tp-card tp-rise text-center py-12">
      <p className="text-xl m-0">{title}</p>
      {body && <p className="mt-2 text-sm m-0" style={{ color: 'var(--tp-muted)' }}>{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function TpError({ error, onRetry }) {
  return (
    <div className="tp-card" role="alert">
      <p className="text-xl m-0">Could not load this</p>
      <p className="mt-2 text-sm m-0" style={{ color: 'var(--tp-muted)' }}>
        {error || 'Something went wrong.'}
      </p>
      {onRetry && (
        <button type="button" className="tp-btn mt-5" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function TpNoAccess({ what = 'this page' }) {
  return (
    <div className="tp-card" role="alert">
      <p className="text-xl m-0">You do not have access to {what}</p>
      <p className="mt-2 text-sm m-0" style={{ color: 'var(--tp-muted)' }}>
        Attendance and individual performance data are limited to a person and
        their manager. Ask an administrator if you think this is wrong.
      </p>
    </div>
  )
}

export function TpNotBuiltYet({ screen, phase, needs }) {
  return (
    <div className="tp-card">
      <p className="tp-label m-0">Not built yet</p>
      <p className="text-xl mt-2 m-0">{screen}</p>
      <p className="mt-2 text-sm m-0" style={{ color: 'var(--tp-muted)' }}>
        Scheduled for phase {phase}. {needs}
      </p>
      <p className="mt-4 text-sm m-0" style={{ color: 'var(--tp-muted)' }}>
        This screen shows nothing rather than sample numbers: a dashboard that
        invents figures is worse than one that admits it has none.
      </p>
    </div>
  )
}
