import { Skeleton } from '@/components/ui/skeleton'

export default function MyBookingsLoading() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-4 w-24 mb-2" />
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
