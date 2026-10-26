import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Role } from "@shared/domain";
import { Avatar } from "@/components/ui/Avatar";
import { DemoBadge } from "@/components/ui/Badge";
import { Logo, ThemeToggle } from "@/components/ui/Brand";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { ease, spring } from "@/design/motion";
import { api, type Persona } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { homeFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

const PERSONA_SEEDS: Record<string, string> = {
  eleanor: "usr_demo_eleanor",
  theo: "usr_demo_theo",
  sora: "usr_demo_sora",
  maya: "usr_demo_maya",
  new: "new-seeker",
};

export default function Login() {
  useDocumentTitle("Sign in");
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(params.get("role") === "seeker" ? "seeker" : "patron");
  const personas = useQuery({ queryKey: ["personas"], queryFn: api.personas, staleTime: Infinity });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: (p: { role: Role; persona: string }) => api.demoLogin(p.role, p.persona),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(["me"], { user });
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role), { replace: true });
    },
  });

  const list: Persona[] = personas.data ? personas.data[role === "patron" ? "patrons" : "seekers"] : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: ease.outExpo }}>
          <DemoBadge />
          <h1 className="display mt-6 text-display-lg text-balance">
            Step inside.
            <br />
            <span className="text-ink-3 italic">Pick who you’ll be.</span>
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-2 text-pretty">
            Windfall is a demo. There are no passwords and no real money — choose a persona and explore instantly. Gifts move through an
            internal ledger, never a bank.
          </p>
        </m.div>

        <m.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.08, ease: ease.outExpo }}
          className="card-surface p-3 sm:p-4"
          aria-label="Choose a demo persona"
        >
          <div className="grid grid-cols-2 gap-1 rounded-[22px] bg-surface-2 p-1" role="tablist" aria-label="Role">
            {(["patron", "seeker"] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => setRole(r)}
                className={cn("relative h-12 rounded-[18px] text-[15px] font-medium transition-colors ring-focus", role === r ? "text-ink" : "text-ink-2 hover:text-ink")}
              >
                {role === r && <m.span layoutId="role-pill" transition={spring.snappy} className="absolute inset-0 rounded-[18px] bg-surface shadow-sm" />}
                <span className="relative">{r === "patron" ? "I’m a Patron" : "I’m a Seeker"}</span>
              </button>
            ))}
          </div>

          <p className="px-3 pt-5 pb-3 text-[14px] text-ink-2">
            {role === "patron" ? "Swipe through stories and give. Each Patron has a history already." : "Share a story, track gifts and post updates."}
          </p>

          <div className="min-h-[300px]">
            {personas.isPending ? (
              <div className="space-y-2 p-1">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : personas.error ? (
              <ErrorState error={personas.error} onRetry={() => personas.refetch()} />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <m.ul
                  key={role}
                  initial={{ opacity: 0, x: role === "seeker" ? 24 : -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: role === "seeker" ? -24 : 24 }}
                  transition={spring.gentle}
                  className="space-y-1.5"
                >
                  {list.map((p) => {
                    const pending = login.isPending && login.variables?.persona === p.persona;
                    return (
                      <li key={p.persona}>
                        <button
                          onClick={() => login.mutate({ role, persona: p.persona })}
                          disabled={login.isPending}
                          className="group flex w-full items-center gap-4 rounded-tile p-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60 ring-focus"
                        >
                          <Avatar seed={PERSONA_SEEDS[p.persona] ?? p.persona} name={p.persona === "new" ? "+" : p.displayName} className="size-14 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[16px] font-medium">{p.displayName}</span>
                            <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{p.blurb}</span>
                          </span>
                          {pending ? (
                            <span className="size-5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" aria-label="Signing in" />
                          ) : (
                            <ArrowRight className="size-5 text-ink-3 transition-transform duration-(--duration-base) group-hover:translate-x-1 group-hover:text-ink" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </m.ul>
              </AnimatePresence>
            )}
          </div>
          {login.error && (
            <p role="alert" className="px-3 pb-2 text-[14px] text-danger">
              {login.error.message}
            </p>
          )}
          <p className="flex items-center gap-2 border-t border-line px-3 pt-4 pb-2 text-[12.5px] text-ink-3">
            <FlaskConical className="size-3.5" aria-hidden /> All personas, stories and gifts are fictional.
          </p>
        </m.section>
      </main>
    </div>
  );
}
