import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, EyeOff, FileCheck2, MessageCircleHeart, Newspaper, Pause, Play, ShieldCheck, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Switch } from "radix-ui";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { formatUSD, formatUSDWhole, progress, remainingCents } from "@shared/money";
import { postUpdateSchema } from "@shared/schemas";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, VerificationBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { Sheet } from "@/components/ui/Sheet";
import { Ticker } from "@/components/ui/Ticker";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, shortDate, timeAgo } from "@/lib/utils";
import { FileDrop } from "./FileDrop";
import { STATUS_BADGE } from "./status";

export default function ManageRequest() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-request", id], queryFn: () => api.myRequest(id!), refetchInterval: 4000 });
  useDocumentTitle("Manage request");

  // Celebrate gifts that arrive while the page is open.
  const lastGift = useRef<string | null>(null);
  useEffect(() => {
    const newest = q.data?.gifts[0];
    if (!newest) return;
    if (lastGift.current && newest.id !== lastGift.current) {
      const msg = `New gift: ${formatUSD(newest.amountCents)} from ${newest.from ?? "an anonymous Patron"}`;
      toast({ message: msg, tone: "gold" });
      announce(msg);
    }
    lastGift.current = newest.id;
  }, [q.data?.gifts]);

  const patch = useMutation({
    mutationFn: (p: { status?: "active" | "paused" | "closed"; blurPhoto?: boolean }) => api.updateRequest(id!, p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-request", id] });
      void qc.invalidateQueries({ queryKey: ["my-requests"] });
    },
    onError: (e) => toast({ message: e.message, tone: "danger" }),
  });

  if (q.isPending)
    return (
      <main className="mx-auto max-w-5xl px-4 pt-12 sm:px-6" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-56 rounded-card" />
      </main>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { request: r, gifts } = q.data;
  const pct = progress(r.goalCents, r.fundedCents);
  const s = STATUS_BADGE[r.status];
  const editable = r.status === "active" || r.status === "paused";

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <Link to="/seeker" className="inline-flex items-center gap-1.5 rounded-full text-[14px] text-ink-2 hover:text-ink ring-focus">
        <ArrowLeft className="size-4" aria-hidden /> My requests
      </Link>

      <header className="mt-6 flex flex-wrap items-start gap-6">
        <Avatar seed={r.avatarSeed} name={r.firstName} photoUrl={r.photoUrl} blur={r.blurPhoto} shape="card" className="size-20 rounded-[22px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={s.tone}>{s.label}</Badge>
            <VerificationBadge status={r.verification} />
          </div>
          <h1 className="display mt-3 text-display-md text-balance">“{r.headline}”</h1>
          <p className="mt-2 text-[14px] text-ink-3">
            Shown to Patrons as <span className="text-ink-2">{r.firstName}</span>, {r.city} · posted {timeAgo(r.createdAt)} ·{" "}
            <Link to={`/story/${r.id}`} className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              view public page
            </Link>
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <section className="card-surface p-6 sm:p-7" aria-label="Live funding">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                {r.status === "active" && <span className="absolute inline-flex size-full rounded-full bg-sage opacity-60 motion-safe:animate-ping" />}
                <span className={cn("relative inline-flex size-2 rounded-full", r.status === "active" ? "bg-sage" : "bg-ink-3")} />
              </span>
              <p className="eyebrow">{r.status === "active" ? "Live" : s.label}</p>
            </div>
            <p className="display mt-4 text-[3.4rem] leading-none">
              <Ticker value={r.fundedCents} format={formatUSDWhole} />
            </p>
            <p className="mt-2 text-[14.5px] text-ink-2 num">
              raised of {formatUSD(r.goalCents)} · {formatUSD(remainingCents(r.goalCents, r.fundedCents))} to go
            </p>
            <Progress className="mt-5" value={pct} size="lg" />
          </section>

          <section aria-labelledby="gifts-h">
            <h2 id="gifts-h" className="display text-[1.7rem]">
              Gifts <span className="text-ink-3 num">{gifts.length}</span>
            </h2>
            {gifts.length === 0 ? (
              <p className="mt-4 rounded-tile bg-surface-2 p-5 text-[14.5px] text-ink-2">
                No gifts yet. Most requests see their first gift within a day or two — a short update can help.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-tile bg-surface hairline">
                <AnimatePresence initial={false}>
                  {gifts.map((g) => (
                    <motion.li key={g.id} layout initial={{ opacity: 0, backgroundColor: "var(--wf-gold-soft)" }} animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 1.2 }} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                      <Avatar seed={g.avatarSeed} className="size-9 shrink-0" monogram={false} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{g.from ?? "Anonymous Patron"}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {timeAgo(g.createdAt)}
                          {g.kind === "clear" && " · cleared the rest"}
                        </p>
                      </div>
                      <span className="num text-[15px] font-medium">{formatUSD(g.amountCents)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {editable && <PostUpdate requestId={r.id} hasGifts={gifts.length > 0} />}
          {r.verification === "unverified" && editable && <VerifyPanel requestId={r.id} />}
          {r.verification === "pending" && (
            <div className="flex gap-3 rounded-tile bg-gold-soft p-5 text-[14px] text-gold-ink">
              <FileCheck2 className="size-5 shrink-0" aria-hidden />
              <p>Your document is being reviewed. This demo simulates review — it’ll show “Verified” in about 20 seconds.</p>
            </div>
          )}

          <section className="card-surface p-5 sm:p-6" aria-labelledby="dignity-h">
            <h2 id="dignity-h" className="flex items-center gap-2 text-[15px] font-medium">
              <ShieldCheck className="size-4 text-sage-ink" aria-hidden /> Your privacy & control
            </h2>
            <ul className="mt-4 space-y-4 text-[14px]">
              <li className="flex items-start justify-between gap-4">
                <span>
                  <span className="block font-medium">First name only</span>
                  <span className="text-ink-2">Always on. Patrons never see your surname or address.</span>
                </span>
                <Badge tone="sage">On</Badge>
              </li>
              <ToggleRow
                label="Blur my photo"
                hint="Patrons see a soft, blurred version."
                icon={EyeOff}
                checked={r.blurPhoto}
                onChange={(v) => patch.mutate({ blurPhoto: v })}
                disabled={!r.photoUrl}
                disabledHint="Add a photo to use this."
              />
            </ul>
            {editable && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
                {r.status === "active" ? (
                  <Button variant="outline" size="sm" onClick={() => patch.mutate({ status: "paused" })}>
                    <Pause className="size-4" aria-hidden /> Pause request
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => patch.mutate({ status: "active" })}>
                    <Play className="size-4" aria-hidden /> Resume request
                  </Button>
                )}
                <CloseRequest onConfirm={() => patch.mutate({ status: "closed" })} />
              </div>
            )}
          </section>

          {r.updates.length > 0 && (
            <section aria-labelledby="updates-h">
              <h2 id="updates-h" className="eyebrow">
                Your updates
              </h2>
              <ol className="mt-4 space-y-4">
                {r.updates.map((u) => (
                  <li key={u.id} className="rounded-tile bg-surface p-4 hairline">
                    <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      {u.kind === "thanks" ? <MessageCircleHeart className="size-3.5" aria-hidden /> : <Newspaper className="size-3.5" aria-hidden />}
                      {u.kind === "thanks" ? "Thank-you note" : "Update"} · {shortDate(u.createdAt)}
                    </p>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed">{u.body}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function PostUpdate({ requestId, hasGifts }: { requestId: string; hasGifts: boolean }) {
  const [kind, setKind] = useState<"update" | "thanks">(hasGifts ? "thanks" : "update");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const id = useId();
  const post = useMutation({
    mutationFn: () => api.postUpdate(requestId, kind, body),
    onSuccess: () => {
      setBody("");
      toast({ message: kind === "thanks" ? "Thank-you note sent to your Patrons" : "Update posted", tone: "sage" });
      void qc.invalidateQueries({ queryKey: ["my-request", requestId] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <section className="card-surface p-5 sm:p-6" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-[15px] font-medium">
        Share something
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Kind of post">
        {(["thanks", "update"] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("relative h-9 rounded-full text-[13.5px] font-medium ring-focus", kind === k ? "text-ink" : "text-ink-2")}
          >
            {kind === k && <motion.span layoutId={`${id}-pill`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-surface shadow-sm" />}
            <span className="relative">{k === "thanks" ? "Thank-you note" : "Progress update"}</span>
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-body`} className="sr-only">
        Message
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
        rows={4}
        maxLength={600}
        placeholder={kind === "thanks" ? "A few words for the people who gave…" : "What’s changed since you posted?"}
        className="mt-3 w-full resize-none rounded-control bg-surface-2 p-4 text-[15px] leading-relaxed placeholder:text-ink-3 ring-focus"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3 num">{body.length}/600</span>
        <Button
          size="sm"
          disabled={post.isPending}
          onClick={() => {
            const v = postUpdateSchema.safeParse({ kind, body });
            if (!v.success) return setError(v.error.issues[0]?.message ?? "Check your message");
            post.mutate();
          }}
        >
          Post
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function VerifyPanel({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
  const attach = useMutation({
    mutationFn: (key: string) => api.attachDocument(requestId, key),
    onSuccess: () => {
      toast({ message: "Document received — review started", tone: "gold" });
      void qc.invalidateQueries({ queryKey: ["my-request", requestId] });
    },
  });
  return (
    <section className="card-surface p-5 sm:p-6" aria-label="Get verified">
      <h2 className="flex items-center gap-2 text-[15px] font-medium">
        <FileCheck2 className="size-4 text-gold-ink" aria-hidden /> Get verified
      </h2>
      <p className="mt-2 text-[14px] text-ink-2">Verified requests are shown to more Patrons. Upload a statement or bill — only our reviewers see it.</p>
      <div className="mt-4">
        <FileDrop kind="proof" onUploaded={(key) => attach.mutate(key)} />
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  disabledHint,
}: {
  label: string;
  hint: string;
  icon: typeof EyeOff;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-4">
      <label htmlFor={id}>
        <span className="block font-medium">{label}</span>
        <span className="text-ink-2">{disabled && disabledHint ? disabledHint : hint}</span>
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors disabled:opacity-40 data-[state=checked]:bg-ink ring-focus"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </li>
  );
}

function CloseRequest({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setOpen(true)}>
        <XCircle className="size-4" aria-hidden /> Close request
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Close this request?" description="Patrons will no longer see it. Gifts you’ve already received are yours to keep. This can’t be undone.">
        <div className="flex gap-3 pb-1">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Keep it open
          </Button>
          <Button
            className="flex-1 bg-danger text-white hover:bg-danger/90"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Close request
          </Button>
        </div>
      </Sheet>
    </>
  );
}
