import { Skeleton } from '@/components/ui/skeleton'

export default function TournamentLoading() {
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Skeleton className="h-7 w-64 mb-2" />
        <Skeleton className="h-4 w-44 mb-6" />
        <div className="bg-card rounded-xl border p-4 flex gap-6 overflow-hidden">
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col} className="flex flex-col justify-around gap-3 min-w-[220px]">
              {Array.from({ length: 4 - col }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
