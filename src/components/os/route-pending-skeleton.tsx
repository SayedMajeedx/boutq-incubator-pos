export function RoutePendingSkeleton() {
  return (
    <div className="h-full w-full min-w-0 space-y-6 overflow-hidden p-4 animate-pulse select-none md:p-6">
      {/* Skeleton Header / Title Bar */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="h-7 w-48 max-w-full bg-muted/60 rounded-lg" />
          <div className="h-4 w-72 max-w-full bg-muted/40 rounded-md" />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <div className="h-9 w-full bg-muted/50 rounded-lg sm:w-24" />
          <div className="h-9 w-full bg-primary/20 rounded-lg sm:w-28" />
        </div>
      </div>

      {/* Skeleton Metric / Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="min-w-0 space-y-3 rounded-xl border border-border/40 bg-card/40 p-3 shadow-xs sm:p-4"
          >
            <div className="h-3.5 w-20 bg-muted/50 rounded-xs" />
            <div className="h-6 w-28 max-w-full bg-muted/70 rounded-md" />
            <div className="h-3 w-16 bg-muted/30 rounded-xs" />
          </div>
        ))}
      </div>

      {/* Skeleton Content Table / List Area */}
      <div className="min-w-0 space-y-4 rounded-xl border border-border/40 bg-card/30 p-3 sm:p-4">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-3 border-b border-border/30 pb-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="h-9 w-64 max-w-full bg-muted/50 rounded-lg" />
          <div className="h-9 w-full bg-muted/40 rounded-lg" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex min-w-0 items-center justify-between gap-3 py-2 border-b border-border/20 last:border-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted/60" />
              <div className="min-w-0 space-y-1.5">
                <div className="h-4 w-36 max-w-full bg-muted/60 rounded-xs" />
                <div className="h-3 w-24 bg-muted/30 rounded-xs" />
              </div>
            </div>
            <div className="h-6 w-16 shrink-0 bg-muted/40 rounded-full sm:w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
