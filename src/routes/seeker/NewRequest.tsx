import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Switch } from "radix-ui";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type Category, type RequestCard } from "@shared/domain";
import { COUNTRIES } from "@shared/geo";
import { formatUSD } from "@shared/money";
import { amountStepSchema, newRequestSchema, storyStepSchema } from "@shared/schemas";
import { SwipeCard } from "@/components/deck/SwipeCard";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { ease, spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { FileDrop } from "./FileDrop";

interface Draft {
  firstName: string;
  headline: string;
  story: string;
  breakdown: { label: string; dollars: string }[];
  category: Category | null;
  countryCode: string;
  city: string;
  age: string;
  photoKey: string | null;
  photoPreview: string | null;
  blurPhoto: boolean;
  documentKey: string | null;
  documentName: string | null;
}

const EMPTY: Draft = {
  firstName: "",
  headline: "",
  story: "",
  breakdown: [{ label: "", dollars: "" }],
  category: null,
  countryCode: "US",
  city: "",
  age: "",
  photoKey: null,
  photoPreview: null,
  blurPhoto: false,
  documentKey: null,
  documentName: null,
};

const STEPS = ["Your story", "The numbers", "About you", "A photo", "Proof", "Review"] as const;
const DRAFT_KEY = "wf-request-draft";

const toCents = (d: string) => Math.round(Number(d.replace(/[^0-9.]/g, "")) * 100) || 0;

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>), photoPreview: null };
  } catch {
    /* storage unavailable */
  }
  return EMPTY;
}

export default function NewRequest() {
  useDocumentTitle("New request");
  const { data: me } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Prefill the first name once the profile arrives.
  const knownName = me?.user?.displayName && me.user.displayName !== "New Seeker" ? me.user.displayName : null;
  if (knownName && !draft.firstName && !draft.story) setDraft((d) => ({ ...d, firstName: knownName }));

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, photoPreview: null }));
    } catch {
      /* ignore */
    }
  }, [draft]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setError(null);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const breakdownCents = draft.breakdown.map((b) => ({ label: b.label.trim(), amountCents: toCents(b.dollars) }));
  const total = breakdownCents.reduce((s, b) => s + b.amountCents, 0);
  const country = COUNTRIES.find((c) => c.code === draft.countryCode);

  const validate = (i: number): string | null => {
    if (i === 0) {
      const r = storyStepSchema.safeParse(draft);
      return r.success ? null : (r.error.issues[0]?.message ?? "Check your story");
    }
    if (i === 1) {
      const r = amountStepSchema.safeParse({ breakdown: breakdownCents });
      return r.success ? null : (r.error.issues[0]?.message ?? "Check your amounts");
    }
    if (i === 2) {
      if (!draft.category) return "Choose the kind of debt";
      if (!draft.city.trim()) return "Add your city";
      const age = draft.age ? Number(draft.age) : null;
      if (age !== null && (!Number.isInteger(age) || age < 18 || age > 110)) return "Age must be 18 or over";
    }
    return null;
  };

  const go = (to: number) => {
    if (to > step) {
      const e = validate(step);
      if (e) return setError(e);
    }
    setError(null);
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const preview: RequestCard = {
      id: "preview",
      firstName: draft.firstName || "You",
      age: draft.age ? Number(draft.age) : null,
      city: draft.city || "Your city",
      country: country?.name ?? "",
      countryCode: draft.countryCode,
      category: draft.category ?? "medical",
      headline: draft.headline || "Your headline appears here",
      story: draft.story,
      breakdown: breakdownCents,
      goalCents: total || 100_000,
      fundedCents: 0,
      giftCount: 0,
      verification: draft.documentKey ? "pending" : "unverified",
      status: "active",
      avatarSeed: `${draft.firstName || "you"}-preview`,
      photoUrl: draft.photoPreview,
      blurPhoto: draft.blurPhoto,
      createdAt: 0,
      isDemo: true,
  };

  const publish = useMutation({
    mutationFn: () =>
      api.createRequest(
        newRequestSchema.parse({
          firstName: draft.firstName,
          headline: draft.headline,
          story: draft.story,
          breakdown: breakdownCents,
          category: draft.category,
          city: draft.city,
          country: country?.name ?? draft.countryCode,
          countryCode: draft.countryCode,
          age: draft.age ? Number(draft.age) : null,
          blurPhoto: draft.blurPhoto,
          photoKey: draft.photoKey && !draft.photoKey.startsWith("local:") ? draft.photoKey : null,
          documentKey: draft.documentKey,
        }),
      ),
    onSuccess: ({ request }) => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      void qc.invalidateQueries({ queryKey: ["my-requests"] });
      toast({ message: "Your request is live. Patrons can see it now.", tone: "sage" });
      navigate(`/seeker/requests/${request.id}`, { replace: true });
    },
    onError: (e) => setError(e.message),
  });

  const panels: ReactNode[] = [
    <StoryStep key="s0" draft={draft} set={set} />,
    <AmountStep key="s1" draft={draft} setDraft={setDraft} total={total} />,
    <AboutStep key="s2" draft={draft} set={set} />,
    <PhotoStep key="s3" draft={draft} set={set} preview={preview} />,
    <ProofStep key="s4" draft={draft} set={set} />,
    <ReviewStep key="s5" draft={draft} preview={preview} total={total} goTo={go} />,
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      <p className="eyebrow">New request · step {step + 1} of {STEPS.length}</p>
      <ol className="mt-4 flex gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="h-1 flex-1 overflow-hidden rounded-full bg-line" aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">
              {label}
              {i < step ? " (done)" : ""}
            </span>
            <motion.span
              className="block h-full origin-left rounded-full bg-gold"
              initial={false}
              animate={{ scaleX: i <= step ? 1 : 0 }}
              transition={{ duration: 0.6, ease: ease.outExpo }}
            />
          </li>
        ))}
      </ol>

      <div className="relative mt-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 40 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -40 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: ease.outExpo }}
            aria-labelledby="step-title"
          >
            <h1 id="step-title" className="display text-display-md">
              {STEPS[step]}
            </h1>
            <div className="mt-8">{panels[step]}</div>
          </motion.section>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 rounded-control bg-danger/10 px-4 py-3 text-[14px] text-danger"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate("/seeker") : go(step - 1))}>
          <ArrowLeft className="size-4" aria-hidden /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)}>
            {step === 4 && !draft.documentKey ? "Skip for now" : "Continue"} <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="gold" size="lg" magnetic onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? "Publishing…" : "Publish my request"}
          </Button>
        )}
      </div>
    </main>
  );
}

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function Field({ label, hint, children, counter }: { label: string; hint?: string; children: (id: string) => ReactNode; counter?: string }) {
  const id = useId();
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14.5px] font-medium">
          {label}
        </label>
        {counter && <span className="text-[12px] text-ink-3 num">{counter}</span>}
      </div>
      {children(id)}
      {hint && <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-control bg-surface px-4 text-[16px] shadow-hair placeholder:text-ink-3 ring-focus";

function StoryStep({ draft, set }: { draft: Draft; set: SetFn }) {
  return (
    <div className="space-y-6">
      <p className="text-[16px] leading-relaxed text-ink-2 text-pretty">
        Write it the way you’d tell a friend. Patrons respond to specifics: what happened, what you’ve already done, and what clearing it would
        change.
      </p>
      <Field label="First name" hint="Only your first name is ever shown.">
        {(id) => <input id={id} className={cn(inputCls, "h-12")} value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" maxLength={30} />}
      </Field>
      <Field label="Headline" counter={`${draft.headline.length}/80`}>
        {(id) => (
          <input
            id={id}
            className={cn(inputCls, "h-12")}
            value={draft.headline}
            onChange={(e) => set("headline", e.target.value)}
            maxLength={80}
            placeholder="e.g. Six sewing machines and one loan left to finish"
          />
        )}
      </Field>
      <Field label="Your story" counter={`${draft.story.length}/2000`} hint="At least 80 characters. Blank lines become paragraphs.">
        {(id) => (
          <textarea
            id={id}
            className={cn(inputCls, "min-h-56 resize-y py-3.5 leading-relaxed")}
            value={draft.story}
            onChange={(e) => set("story", e.target.value)}
            maxLength={2000}
          />
        )}
      </Field>
    </div>
  );
}

function AmountStep({ draft, setDraft, total }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; total: number }) {
  const update = (i: number, patch: Partial<Draft["breakdown"][number]>) =>
    setDraft((d) => ({ ...d, breakdown: d.breakdown.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  return (
    <div>
      <p className="text-[16px] leading-relaxed text-ink-2">Break the total into its parts. Patrons trust a clear breakdown.</p>
      <ul className="mt-6 space-y-3">
        <AnimatePresence initial={false}>
          {draft.breakdown.map((b, i) => (
            <motion.li
              key={i}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.gentle}
              className="flex gap-2"
            >
              <input
                aria-label={`Item ${i + 1} description`}
                placeholder="e.g. Hospital stay"
                className={cn(inputCls, "h-12 min-w-0 flex-1")}
                value={b.label}
                maxLength={60}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <div className="relative w-36 shrink-0">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3">$</span>
                <input
                  aria-label={`Item ${i + 1} amount in dollars`}
                  inputMode="decimal"
                  placeholder="0"
                  className={cn(inputCls, "h-12 pl-8 num")}
                  value={b.dollars}
                  onChange={(e) => update(i, { dollars: e.target.value.replace(/[^0-9.,]/g, "") })}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                disabled={draft.breakdown.length === 1}
                onClick={() => setDraft((d) => ({ ...d, breakdown: d.breakdown.filter((_, j) => j !== i) }))}
                className="grid size-12 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30 ring-focus"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {draft.breakdown.length < 6 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setDraft((d) => ({ ...d, breakdown: [...d.breakdown, { label: "", dollars: "" }] }))}>
          <Plus className="size-4" aria-hidden /> Add an item
        </Button>
      )}
      <div className="mt-8 flex items-baseline justify-between border-t border-line pt-6">
        <span className="eyebrow">Total request</span>
        <span className="display text-[3rem] leading-none num">{formatUSD(total)}</span>
      </div>
    </div>
  );
}

function AboutStep({ draft, set }: { draft: Draft; set: SetFn }) {
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-[14.5px] font-medium">What kind of debt is it?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
          {CATEGORIES.map((c) => {
            const active = draft.category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set("category", c)}
                className={cn(
                  "relative flex h-20 items-end rounded-tile p-4 text-left text-[14.5px] font-medium transition-colors ring-focus",
                  active ? "bg-ink text-on-ink" : "bg-surface shadow-hair hover:bg-surface-2",
                )}
              >
                {active && <Check className="absolute top-3 right-3 size-4" aria-hidden />}
                {CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Country">
          {(id) => (
            <select id={id} className={cn(inputCls, "h-12 appearance-none")} value={draft.countryCode} onChange={(e) => set("countryCode", e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="City">{(id) => <input id={id} className={cn(inputCls, "h-12")} value={draft.city} maxLength={60} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />}</Field>
        <Field label="Age (optional)">
          {(id) => <input id={id} inputMode="numeric" className={cn(inputCls, "h-12 num")} value={draft.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, "").slice(0, 3))} />}
        </Field>
      </div>
    </div>
  );
}

function PhotoStep({ draft, set, preview }: { draft: Draft; set: SetFn; preview: RequestCard }) {
  const blurId = useId();
  return (
    <div className="grid gap-8 sm:grid-cols-[1fr_260px]">
      <div className="space-y-5">
        <p className="text-[16px] leading-relaxed text-ink-2 text-pretty">
          A photo is optional. Without one, Windfall gives you a calm generated portrait — many Seekers prefer it.
        </p>
        <FileDrop
          kind="photo"
          onUploaded={(key, url) => {
            set("photoKey", key);
            set("photoPreview", url);
          }}
        />
        <div className="flex items-center justify-between gap-4 rounded-tile bg-surface-2 px-4 py-3.5">
          <label htmlFor={blurId} className="text-[14px]">
            <span className="block font-medium">Blur my photo</span>
            <span className="text-[13px] text-ink-2">Patrons see a soft, blurred version.</span>
          </label>
          <Switch.Root
            id={blurId}
            checked={draft.blurPhoto}
            onCheckedChange={(v) => set("blurPhoto", v)}
            className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink ring-focus"
          >
            <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>
        {draft.photoKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              set("photoKey", null);
              set("photoPreview", null);
            }}
          >
            Use a generated portrait instead
          </Button>
        )}
      </div>
      <CardPreview card={preview} />
    </div>
  );
}

function ProofStep({ draft, set }: { draft: Draft; set: SetFn }) {
  return (
    <div className="space-y-6">
      <p className="text-[16px] leading-relaxed text-ink-2 text-pretty">
        Upload a bill, statement or letter that shows the debt. It’s seen only by reviewers — never by Patrons. Verified requests can be found with
        the “Verified only” filter.
      </p>
      <FileDrop
        kind="proof"
        onUploaded={(key, _url, file) => {
          set("documentKey", key);
          set("documentName", file.name);
        }}
      />
      <ol className="grid grid-cols-3 gap-2 text-center text-[12.5px]" aria-label="Verification states">
        {[
          ["Uploaded", !!draft.documentKey],
          ["Pending review", !!draft.documentKey],
          ["Verified", false],
        ].map(([label, on], i) => (
          <li key={String(label)} className={cn("rounded-tile px-2 py-3", on ? "bg-gold-soft text-gold-ink" : "bg-surface-2 text-ink-3")}>
            <span className="block text-[11px] tracking-[0.08em] uppercase">Step {i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-ink-3">In this demo, review is simulated: “Pending” turns “Verified” about 20 seconds after you publish.</p>
    </div>
  );
}

function ReviewStep({ draft, preview, total, goTo }: { draft: Draft; preview: RequestCard; total: number; goTo: (i: number) => void }) {
  const rows: [string, string, number][] = [
    ["Name", draft.firstName, 0],
    ["Headline", draft.headline, 0],
    ["Total", formatUSD(total), 1],
    ["Category", draft.category ? CATEGORY_LABELS[draft.category] : "—", 2],
    ["Location", `${draft.city}, ${COUNTRIES.find((c) => c.code === draft.countryCode)?.name ?? ""}`, 2],
    ["Photo", draft.photoKey ? (draft.blurPhoto ? "Uploaded · blurred" : "Uploaded") : "Generated portrait", 3],
    ["Proof", draft.documentName ?? "Not yet — you can add it later", 4],
  ];
  return (
    <div className="grid gap-8 sm:grid-cols-[1fr_260px]">
      <dl className="divide-y divide-line rounded-tile bg-surface shadow-hair">
        {rows.map(([k, v, s]) => (
          <div key={k} className="flex items-start gap-4 px-4 py-3.5">
            <dt className="w-24 shrink-0 text-[13.5px] text-ink-3">{k}</dt>
            <dd className="min-w-0 flex-1 text-[14.5px] break-words">{v}</dd>
            <button onClick={() => goTo(s)} className="text-[13px] font-medium text-gold-ink hover:underline ring-focus rounded">
              Edit
            </button>
          </div>
        ))}
      </dl>
      <CardPreview card={preview} />
    </div>
  );
}

function CardPreview({ card }: { card: RequestCard }) {
  return (
    <div>
      <p className="eyebrow mb-3">How Patrons see you</p>
      <div className="h-[400px] w-full">
        <SwipeCard card={card} interactive={false} />
      </div>
    </div>
  );
}
