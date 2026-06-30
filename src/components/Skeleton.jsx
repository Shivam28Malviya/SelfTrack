// Shimmering skeleton placeholder.
export default function Skeleton({ className = '', rounded = 'rounded-lg' }) {
  return (
    <div
      className={`${rounded} ${className} relative overflow-hidden bg-white/10`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s linear infinite',
      }}
    />
  )
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <Skeleton className="w-6 h-4" />
      <Skeleton className="w-9 h-9" rounded="rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="w-32 h-3" />
        <Skeleton className="w-20 h-2.5" />
      </div>
      <Skeleton className="w-12 h-4" />
    </div>
  )
}
