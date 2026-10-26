import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkX } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Link } from "react-router";
import { CATEGORY_LABELS } from "@shared/domain";
import { formatUSD, progress, remainingCents } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, VerificationBadge } from "@/components/ui/Badge";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { timeAgo } from "@/lib/utils";

export default function Saved() {
  useDocumentTitle("Maybe later");
  const q = useQuery({ queryKey: ["saved"], queryFn: api.saved });
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.unswipe(id),
    onMutate: (id) => {
      qc.setQueryData<Awaited<ReturnType<typeof api.saved>>>(["saved"], (d) => d && { saved: d.saved.filter((s) => s.id !== id) });
    },
    onSuccess: () => {
      toast({ message: "Removed — they’ll appear in your deck again" });
      void qc.invalidateQueries({ queryKey: ["deck"] });
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <p className="eyebrow">Saved</p>
      <h1 className="display mt-4 text-display-lg">Maybe later</h1>
      <p className="mt-3 text-[16px] text-ink-2">People you wanted to come back to. Press S or tap the bookmark while swiping.</p>

      {q.isPending ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-card" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.saved.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="When a story stays with you but the moment isn’t right, save it for later."
          action={
            <ButtonLink to="/discover" variant="outline">Back to the deck</ButtonLink>
          }
        />
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {q.data.saved.map((s) => (
              <m.li
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={spring.gentle}
                className="card-surface relative flex gap-4 p-4 sm:p-5"
              >
                <Avatar seed={s.avatarSeed} name={s.firstName} photoUrl={s.photoUrl} blur={s.blurPhoto} shape="card" className="size-24 shrink-0 rounded-[20px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{CATEGORY_LABELS[s.category]}</Badge>
                    {s.verification === "verified" && <VerificationBadge status="verified" />}
                    {s.status === "funded" && <Badge tone="sage">Cleared by others</Badge>}
                  </div>
                  <Link to={`/story/${s.id}`} className="mt-2 block rounded ring-focus after:absolute after:inset-0 after:rounded-card">
                    <h2 className="display text-[1.6rem] leading-tight">{s.firstName}</h2>
                    <p className="line-clamp-2 text-[14px] text-ink-2">{s.headline}</p>
                  </Link>
                  <Progress className="mt-3" value={progress(s.goalCents, s.fundedCents)} size="sm" />
                  <p className="mt-2 text-[12.5px] text-ink-3 num">
                    {formatUSD(remainingCents(s.goalCents, s.fundedCents))} to go · saved {timeAgo(s.savedAt)}
                  </p>
                </div>
                <IconButton label={`Remove ${s.firstName} from Maybe later`} size="sm" tone="plain" className="relative z-10 -mt-1 -mr-1" onClick={() => remove.mutate(s.id)}>
                  <BookmarkX className="size-4" aria-hidden />
                </IconButton>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </main>
  );
}
