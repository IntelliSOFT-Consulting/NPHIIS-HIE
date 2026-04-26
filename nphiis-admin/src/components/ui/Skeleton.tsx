interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  return (
    <span
      className={`block bg-nphi-100/60 animate-pulse rounded-${rounded} ${className}`}
      aria-hidden
    />
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="h-4 w-1/3 bg-nphi-100/60 rounded-md animate-pulse" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-nphi-100/40 rounded-md animate-pulse"
          style={{ width: `${80 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-nphi-100/60 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 bg-nphi-100/40 rounded-md animate-pulse" />
        <div className="h-6 w-1/3 bg-nphi-100/60 rounded-md animate-pulse" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-3 border-b border-nphi-100/60 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 bg-nphi-100/40 rounded-md animate-pulse" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="px-6 py-3 border-b border-nphi-100/30 last:border-0 flex gap-4"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3 flex-1 bg-nphi-100/30 rounded-md animate-pulse"
              style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
