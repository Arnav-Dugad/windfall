import { Skeleton } from "@/components/ui/Feedback";

export function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-4 h-5 w-80 max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
