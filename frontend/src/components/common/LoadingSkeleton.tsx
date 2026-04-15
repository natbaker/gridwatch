export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-bg-elevated rounded-lg ${className}`} />
  )
}
