// Skeleton that mirrors the Open Play console layout, so opening a session
// shows structure immediately instead of a "Loading…" line.
export function OpenPlaySkeleton() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4 sm:p-5 animate-pulse">
      <div className="grid grid-cols-4 gap-2 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-800 rounded-xl h-14" />
        ))}
      </div>
      <div className="h-3 w-16 bg-zinc-800 rounded mb-3" />
      <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-zinc-800 rounded-xl h-28" />
        ))}
      </div>
      <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
      <div className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-800 rounded-lg h-10" />
        ))}
      </div>
    </div>
  )
}
