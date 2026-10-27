import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CalendarDays, EyeOff, FileCheck2, HeartHandshake, MessageCircleHeart, Newspaper, Pause, Play, ShieldCheck, XCircle } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Switch } from "radix-ui";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import type { SeekerUpdate, Verification } from "@shared/domain";
import { formatUSD, formatUSDWhole, progress, remainingCents } from "@shared/money";
import { postUpdateSchema } from "@shared/schemas";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import { Recorder } from "@/components/media/Recorder";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, VerificationBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { Sheet } from "@/components/ui/Sheet";
import { Ticker } from "@/components/ui/Ticker";
import { toast } from "@/lib/toast";
import { ease, spring } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api } from "@/lib/api";
import { useDocumentTitle, useNow } from "@/lib/hooks";
import { cn, shortDate, timeAgo } from "@/lib/utils";
import { FileDrop } from "./FileDrop";
import { STATUS_BADGE } from "./status";

export default function ManageRequest() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-request", id], queryFn: () => api.myRequest(id!), refetchInterval: 4000 });
  useDocumentTitle("Manage request");
  const now = useNow(60_000);

  // Celebrate gifts that arrive while the page is open.
  const lastGift = useRef<string | null>(null);
  useEffect(() => {
    const newest = q.data?.gifts[0];
    if (!newest) return;
    if (lastGift.current && newest.id !== lastGift.current) {
      const msg = `New gift: ${formatUSD(newest.amountCents)} from ${newest.from ?? "an anonymous Patron"}`;
      toast({ message: msg, tone: "accent" });
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
  // Anonymous gifts can't be told apart, so each counts as its own giver.
  const givers = new Set(gifts.map((g) => g.from ?? g.id)).size;
  const daysLive = Math.max(1, Math.ceil((now - r.createdAt) / 86_400_000));

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

      {/* Widget grid: the four numbers a Seeker checks most, at a glance. */}
      <section aria-label="At a glance" className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Widget i={0} className="col-span-2 lg:row-span-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              {r.status === "active" && <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />}
              <span className={cn("relative inline-flex size-2 rounded-full", r.status === "active" ? "bg-positive" : "bg-ink-3")} />
            </span>
            <p className="eyebrow">{r.status === "active" ? "Live · raised" : s.label}</p>
          </div>
          <p className="display mt-3 text-[2.9rem] leading-none sm:text-[3.4rem]">
            <Ticker value={r.fundedCents} format={formatUSDWhole} />
          </p>
          <p className="mt-2 text-[14px] text-ink-2 num">
            of {formatUSD(r.goalCents)} · {formatUSD(remainingCents(r.goalCents, r.fundedCents))} to go
          </p>
          <Progress className="mt-4" value={pct} size="lg" accent={r.accent} />
        </Widget>
        <Widget i={1} icon={HeartHandshake} label="Givers" tint="text-accent">
          <p className="display text-[2.6rem] leading-none num">{givers}</p>
          <p className="mt-1.5 text-[13px] text-ink-3 num">
            {gifts.length} {gifts.length === 1 ? "gift" : "gifts"}
          </p>
        </Widget>
        <Widget i={2} icon={CalendarDays} label="Days live" tint="text-[#ff9f0a]">
          <p className="display text-[2.6rem] leading-none num">{daysLive}</p>
          <p className="mt-1.5 text-[13px] text-ink-3">since {shortDate(r.createdAt)}</p>
        </Widget>
      </section>
      <VerificationWidget status={r.verification} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">

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
                    <m.li key={g.id} layout initial={{ opacity: 0, backgroundColor: "var(--wf-accent-soft)" }} animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 1.2 }} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                      <Avatar seed={g.avatarSeed} name={g.from ?? undefined} photoUrl={g.photo} className="size-9 shrink-0" monogram={!!g.from} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{g.from ?? "Anonymous Patron"}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {timeAgo(g.createdAt)}
                          {g.kind === "clear" && " · cleared the rest"}
                        </p>
                      </div>
                      <span className="num text-[15px] font-medium">{formatUSD(g.amountCents)}</span>
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {editable && <PostUpdate requestId={r.id} hasGifts={gifts.length > 0} />}
          {editable && <Recorder requestId={r.id} />}
          {r.verification === "unverified" && editable && <VerifyPanel requestId={r.id} />}

          <section className="card-surface p-5 sm:p-6" aria-labelledby="dignity-h">
            <h2 id="dignity-h" className="flex items-center gap-2 text-[15px] font-medium">
              <ShieldCheck className="size-4 text-positive-ink" aria-hidden /> Your privacy & control
            </h2>
            <ul className="mt-4 space-y-4 text-[14px]">
              <li className="flex items-start justify-between gap-4">
                <span>
                  <span className="block font-medium">First name only</span>
                  <span className="text-ink-2">Always on. Patrons never see your surname or address.</span>
                </span>
                <Badge tone="positive">On</Badge>
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
                    {mediaIdOf(u) && <MediaPlayer requestId={r.id} mediaId={mediaIdOf(u)!} accent={r.accent} />}
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

const mediaIdOf = (u: SeekerUpdate) => (u as SeekerUpdate & { mediaId?: string | null }).mediaId ?? null;

function Widget({
  i,
  icon: Icon,
  label,
  tint,
  className,
  children,
}: {
  i: number;
  icon?: typeof EyeOff;
  label?: string;
  tint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: i * 0.06, duration: 0.6, ease: ease.outExpo }}
      className={cn("card-surface squircle flex flex-col justify-between rounded-[26px] p-5 sm:p-6", className)}
    >
      {label && Icon && (
        <p className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
          <Icon className={cn("size-4", tint)} aria-hidden /> {label}
        </p>
      )}
      <div>{children}</div>
    </m.div>
  );
}

const VERIFY: Record<Verification, { title: string; body: string; tone: string }> = {
  verified: { title: "Verified", body: "Your statements were reviewed. Verified stories are shown to more Patrons.", tone: "bg-positive-soft text-positive-ink" },
  pending: { title: "In review", body: "Your document is being reviewed. This demo simulates review — it’ll show “Verified” in about 20 seconds.", tone: "bg-accent-soft text-accent-ink" },
  unverified: { title: "Not verified yet", body: "Upload a statement below to reach Patrons who filter for verified stories.", tone: "bg-fill text-ink-2" },
};

function VerificationWidget({ status }: { status: Verification }) {
  const v = VERIFY[status];
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.6, ease: ease.outExpo }}
      className={cn("squircle mt-3 flex items-center gap-3 rounded-[22px] px-5 py-4 sm:mt-4", v.tone)}
    >
      {status === "verified" ? <BadgeCheck className="size-5 shrink-0" aria-hidden /> : <FileCheck2 className="size-5 shrink-0" aria-hidden />}
      <p className="text-[14px]">
        <span className="font-semibold">{v.title}.</span> {v.body}
      </p>
    </m.div>
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
      toast({ message: kind === "thanks" ? "Thank-you note sent to your Patrons" : "Update posted", tone: "positive" });
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
            {kind === k && <m.span layoutId={`${id}-pill`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-surface shadow-sm" />}
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
      toast({ message: "Document received — review started", tone: "accent" });
      void qc.invalidateQueries({ queryKey: ["my-request", requestId] });
    },
  });
  return (
    <section className="card-surface p-5 sm:p-6" aria-label="Get verified">
      <h2 className="flex items-center gap-2 text-[15px] font-medium">
        <FileCheck2 className="size-4 text-accent-ink" aria-hidden /> Get verified
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
