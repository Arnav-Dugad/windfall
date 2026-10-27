import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Trash2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Switch } from "radix-ui";
import { useId, useState, type ReactNode } from "react";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@shared/domain";
import { formatCompactUSD, formatUSD } from "@shared/money";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { Segmented } from "@/components/ui/Segmented";
import { spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { notificationsEnabled, setNotificationsEnabled } from "@/lib/notify";
import { deleteRecurring, getPrefs, listRecurring, MAX_CAUSE_PLACES, saveRecurring, savePrefs, setRecurringActive, type Prefs } from "@/lib/social";
import { toast } from "@/lib/toast";
import { cn, timeAgo } from "@/lib/utils";

const BUDGETS = [100_000, 250_000, 500_000, 1_000_000, 2_500_000];
const PLEDGES = [10_000, 25_000, 50_000, 100_000];
const RULES = [
  { value: "closest_verified", label: "Closest to cleared", hint: "The verified story nearest its goal" },
  { value: "followed", label: "People I follow", hint: "Whoever you follow who’s closest" },
  { value: "cause", label: "My causes", hint: "The best match for your causes" },
] as const;
type Rule = (typeof RULES)[number]["value"];

export default function Settings() {
  useDocumentTitle("Settings");
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: getPrefs });
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <LargeTitle title="Settings" subtitle="Tune your deck, set a monthly gift, and choose how you hear about the people you help." />
      {prefs.isPending ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-56 rounded-[24px]" />
          <Skeleton className="h-40 rounded-[24px]" />
        </div>
      ) : prefs.data ? (
        <PrefsForm initial={prefs.data} />
      ) : null}
      <Recurring />
      <Privacy />
    </main>
  );
}

function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-2.5 px-1">{title}</h2>
      <div className="glass-thick squircle rounded-[24px] p-4 shadow-card sm:p-5">{children}</div>
      {footer && <p className="mt-2 px-1 text-[12.5px] text-ink-3">{footer}</p>}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors ring-focus", on ? "bg-accent text-white" : "bg-fill text-ink-2 hover:text-ink")}
    >
      {on && <Check className="size-3.5" aria-hidden strokeWidth={2.6} />}
      {children}
    </button>
  );
}

function PrefsForm({ initial }: { initial: Prefs }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const countries = useQuery({ queryKey: ["countries"], queryFn: api.countries, staleTime: 5 * 60_000 });
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () => savePrefs(draft),
    onSuccess: () => {
      for (const k of ["prefs", "deck"]) void qc.invalidateQueries({ queryKey: [k] });
      toast({ message: "Your deck will lean toward these causes", tone: "positive" });
    },
    onError: (e) => toast({ message: e.message, tone: "danger" }),
  });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <Group title="Causes" footer="“For you” weights these first, and still mixes in a few surprises.">
        <p className="mb-2.5 text-[14px] font-medium">Kinds of debt</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c: Category) => (
            <Chip key={c} on={draft.causes.categories.includes(c)} onClick={() => setDraft((d) => ({ ...d, causes: { ...d.causes, categories: toggle(d.causes.categories, c) } }))}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <p className="mt-5 mb-2.5 flex items-baseline justify-between text-[14px] font-medium">
          Places
          <span className="text-[12.5px] font-normal text-ink-3 num">
            {draft.causes.countries.length}/{MAX_CAUSE_PLACES}
          </span>
        </p>
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto no-scrollbar">
          {countries.data?.countries.map((c) => (
            <Chip
              key={c.code}
              on={draft.causes.countries.includes(c.code)}
              onClick={() => {
                if (!draft.causes.countries.includes(c.code) && draft.causes.countries.length >= MAX_CAUSE_PLACES) {
                  toast({ message: `Pick up to ${MAX_CAUSE_PLACES} places — remove one to add another.` });
                  return;
                }
                setDraft((d) => ({ ...d, causes: { ...d.causes, countries: toggle(d.causes.countries, c.code) } }));
              }}
            >
              {c.name}
            </Chip>
          )) ?? <Skeleton className="h-9 w-full rounded-full" />}
        </div>
      </Group>

      <Group title="Budget" footer="Used for “Finish a debt”: people you could clear outright.">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-medium">Most I’d give at once</p>
          <p className="text-[1.6rem] font-bold tracking-[-0.02em] num">{formatUSD(draft.budgetCents)}</p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {BUDGETS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={draft.budgetCents === b}
              onClick={() => setDraft((d) => ({ ...d, budgetCents: b }))}
              className={cn("press h-10 rounded-full text-[13.5px] font-semibold num ring-focus", draft.budgetCents === b ? "bg-ink text-on-ink" : "bg-fill text-ink-2")}
            >
              {formatCompactUSD(b)}
            </button>
          ))}
        </div>
      </Group>

      <AnimatePresence>
        {dirty && (
          <m.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring.sheet} className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 flex justify-center px-4 md:bottom-6">
            <div className="glass-thick flex items-center gap-3 rounded-full p-1.5 pl-5 shadow-float">
              <span className="text-[14px] font-medium">Unsaved changes</span>
              <Button size="sm" variant="ghost" onClick={() => setDraft(initial)}>
                Reset
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Recurring() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["recurring"], queryFn: listRecurring });
  const [amount, setAmount] = useState(PLEDGES[2]!);
  const [rule, setRule] = useState<Rule>("closest_verified");
  const id = useId();
  const refresh = () => qc.invalidateQueries({ queryKey: ["recurring"] });
  const add = useMutation({ mutationFn: () => saveRecurring(amount, rule), onSuccess: () => (void refresh(), toast({ message: `Monthly gift of ${formatUSD(amount)} set up`, tone: "positive" })) });
  const toggle = useMutation({ mutationFn: (v: { id: string; active: boolean }) => setRecurringActive(v.id, v.active), onSettled: refresh });
  const remove = useMutation({ mutationFn: deleteRecurring, onSettled: refresh });

  return (
    <Group title="Monthly gifts" footer="Each month, the next time you open Give, your pledge goes to the person it picks — and you can undo it for 2 minutes. Demo money only.">
      {list.data && list.data.length > 0 && (
        <ul className="-mx-1 mb-4 space-y-1.5">
          {list.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[16px] bg-fill/60 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white">
                <CalendarClock className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold num">{formatUSD(r.amountCents)} / month</p>
                <p className="truncate text-[12.5px] text-ink-3">
                  {RULES.find((x) => x.value === r.rule)?.label} · {r.lastRunAt ? `last sent ${timeAgo(r.lastRunAt)}` : "first gift on your next visit"}
                </p>
              </div>
              <Switch.Root
                checked={r.active}
                onCheckedChange={(active) => toggle.mutate({ id: r.id, active })}
                aria-label={r.active ? "Pause this monthly gift" : "Resume this monthly gift"}
                className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-positive ring-focus"
              >
                <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-(--duration-base) data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
              <button onClick={() => remove.mutate(r.id)} className="press grid size-8 place-items-center rounded-full text-ink-3 hover:text-danger ring-focus" aria-label="Delete this monthly gift">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mb-2.5 text-[14px] font-medium">New monthly gift</p>
      <div className="grid grid-cols-4 gap-1.5">
        {PLEDGES.map((p) => (
          <button key={p} type="button" aria-pressed={amount === p} onClick={() => setAmount(p)} className={cn("press h-10 rounded-full text-[14px] font-semibold num ring-focus", amount === p ? "bg-ink text-on-ink" : "bg-fill text-ink-2")}>
            {formatCompactUSD(p)}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto no-scrollbar">
        <Segmented id={id} small value={rule} onChange={setRule} options={RULES.map((r) => ({ value: r.value, label: r.label }))} />
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">{RULES.find((r) => r.value === rule)?.hint}</p>
      <Button className="mt-4 w-full" disabled={add.isPending} onClick={() => add.mutate()}>
        Give {formatUSD(amount)} every month
      </Button>
    </Group>
  );
}

function Privacy() {
  const { data } = useMe();
  const user = data?.user;
  const [notify, setNotify] = useState(notificationsEnabled);
  const anon = useMutation({
    mutationFn: (v: boolean) => api.updateProfile(v),
    onSuccess: (r) => toast({ message: r.user.anonymousByDefault ? "You’ll give anonymously by default" : "Your name will show on gifts", tone: "accent" }),
  });
  if (!user) return null;
  return (
    <Group title="Privacy & alerts">
      <Row
        title="Give anonymously by default"
        body="Seekers see “Anonymous Patron”, and the leaderboard hides your name."
        checked={user.anonymousByDefault}
        onChange={(v) => anon.mutate(v)}
      />
      {typeof Notification !== "undefined" && (
        <>
          <div className="my-3.5 h-px bg-line" />
          <Row
            title="Milestone alerts"
            body="A quiet notification when someone you follow is 50% there, says thank you, or is cleared."
            checked={notify}
            onChange={async (v) => {
              await setNotificationsEnabled(v);
              setNotify(notificationsEnabled());
              if (v && !notificationsEnabled()) toast({ message: "Notifications are blocked in your browser settings", tone: "danger" });
            }}
          />
        </>
      )}
    </Group>
  );
}

function Row({ title, body, checked, onChange }: { title: string; body: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-[15px]">
        <span className="block font-medium">{title}</span>
        <span className="text-[13px] text-ink-2">{body}</span>
      </label>
      <Switch.Root id={id} checked={checked} onCheckedChange={onChange} className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-positive ring-focus">
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-(--duration-base) data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
