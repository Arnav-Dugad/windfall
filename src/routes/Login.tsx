import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, Lock } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Role } from "@shared/domain";
import { Avatar } from "@/components/ui/Avatar";
import { Logo, ThemeToggle } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { ease, spring } from "@/design/motion";
import { api, type Persona } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { homeFor } from "@/lib/routes";
import type { SessionState } from "@/lib/session";

type Tab = "demo" | "signin" | "signup";

export default function Login() {
  useDocumentTitle("Sign in");
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("mode") === "signup" ? "signup" : params.get("mode") === "signin" ? "signin" : "demo");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  const finish = (role: Role | null) => {
    qc.clear();
    if (!role) navigate(`/welcome${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`, { replace: true });
    else navigate(safeNext ?? homeFor(role), { replace: true });
  };
  const finishSession = (s: SessionState) => finish(s.user?.role ?? null);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <Backdrop />
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pt-4 pb-16 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-20">
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: ease.outExpo }} className="text-center lg:text-left">
          <h1 className="display text-display-lg text-balance">
            Welcome to Windfall.
            <br />
            <span className="text-ink-3">Generosity, one swipe at a time.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-ink-2 text-pretty lg:mx-0">
            Create an account with Google or email, or step straight into a demo persona. Gifts move through a ledger in Firestore,
            never a bank.
          </p>
        </m.div>

        <m.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.06, ease: ease.outExpo }}
          className="glass-thick rounded-[30px] p-2 shadow-float"
          aria-label="Sign in"
        >
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            id="auth-tab"
            options={[
              { value: "demo", label: "Try a demo" },
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Create account" },
            ]}
          />
          <div className="px-3 pt-4 pb-3 sm:px-4">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: ease.outExpo }}
              >
                {tab === "demo" ? (
                  <DemoPanel defaultRole={params.get("role") === "seeker" ? "seeker" : "patron"} onDone={(r) => finish(r)} />
                ) : tab === "signin" ? (
                  <SignInPanel onDone={finishSession} />
                ) : (
                  <SignUpPanel defaultRole={params.get("role") === "seeker" ? "seeker" : "patron"} onDone={(r) => finish(r)} />
                )}
              </m.div>
            </AnimatePresence>
          </div>
        </m.section>
      </main>
    </div>
  );
}

function DemoPanel({ defaultRole, onDone }: { defaultRole: Role; onDone: (role: Role) => void }) {
  const [role, setRole] = useState<Role>(defaultRole);
  const personas = useQuery({ queryKey: ["personas"], queryFn: api.personas, staleTime: Infinity });
  const login = useMutation({
    mutationFn: (p: { role: Role; persona: string }) => api.demoLogin(p.role, p.persona),
    onSuccess: ({ user }) => onDone(user.role),
  });
  const list: Persona[] = personas.data ? personas.data[role === "patron" ? "patrons" : "seekers"] : [];

  return (
    <div>
      <Segmented<Role>
        value={role}
        onChange={setRole}
        id="demo-role"
        small
        options={[
          { value: "patron", label: "I’m a Patron" },
          { value: "seeker", label: "I’m a Seeker" },
        ]}
      />
      <div className="mt-3 min-h-[260px]">
        {personas.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        ) : personas.error ? (
          <ErrorState error={personas.error} onRetry={() => personas.refetch()} />
        ) : (
          <ul className="space-y-1">
            {list.map((p, i) => {
              const pending = login.isPending && login.variables?.persona === p.persona;
              return (
                <m.li key={`${role}-${p.persona}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: i * 0.04 }}>
                  <button
                    onClick={() => login.mutate({ role, persona: p.persona })}
                    disabled={login.isPending}
                    className="group flex w-full items-center gap-3.5 rounded-[18px] p-2.5 text-left transition-colors hover:bg-fill disabled:opacity-60 ring-focus"
                  >
                    <Avatar seed={p.persona} name={p.persona === "new" ? "+" : p.displayName} photoUrl={p.photo} className="size-14 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold">{p.displayName}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-ink-3">{p.blurb}</span>
                    </span>
                    {pending ? (
                      <span className="size-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-label="Signing in" />
                    ) : (
                      <ArrowRight className="size-5 text-ink-3 transition-transform duration-(--duration-base) group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                    )}
                  </button>
                </m.li>
              );
            })}
          </ul>
        )}
      </div>
      {login.error && <FormError>{login.error.message}</FormError>}
      <p className="mt-3 flex items-center gap-2 border-t border-line px-1 pt-3 text-[12.5px] text-ink-3">
        <FlaskConical className="size-3.5" aria-hidden /> Personas, stories and portraits are fictional (portraits are AI-generated).
      </p>
    </div>
  );
}

function SignInPanel({ onDone }: { onDone: (s: SessionState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const google = useMutation({ mutationFn: api.signInWithGoogle, onSuccess: onDone });
  const signIn = useMutation({ mutationFn: () => api.signInWithEmail(email, password), onSuccess: onDone });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    signIn.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <GoogleButton onClick={() => google.mutate()} pending={google.isPending} />
      <Divider />
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
      {(signIn.error || google.error) && <FormError>{(signIn.error ?? google.error)!.message}</FormError>}
      <Button type="submit" size="lg" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>
      <Secure />
    </form>
  );
}

function SignUpPanel({ defaultRole, onDone }: { defaultRole: Role; onDone: (role: Role | null) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(defaultRole);
  const google = useMutation({ mutationFn: api.signInWithGoogle, onSuccess: (s) => onDone(s.user?.role ?? null) });
  const signUp = useMutation({ mutationFn: () => api.signUpWithEmail({ name, email, password, role }), onSuccess: ({ user }) => onDone(user.role) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signUp.mutate();
      }}
      className="space-y-3"
    >
      <GoogleButton onClick={() => google.mutate()} pending={google.isPending} label="Sign up with Google" />
      <Divider />
      <Segmented<Role>
        value={role}
        onChange={setRole}
        id="signup-role"
        small
        options={[
          { value: "patron", label: "I want to give" },
          { value: "seeker", label: "I need a hand" },
        ]}
      />
      <Field label="First name" autoComplete="given-name" value={name} onChange={setName} required maxLength={30} />
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
      <Field label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} required minLength={6} hint="At least 6 characters." />
      {(signUp.error || google.error) && <FormError>{(signUp.error ?? google.error)!.message}</FormError>}
      <Button type="submit" size="lg" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? "Creating account…" : "Create account"}
      </Button>
      <Secure />
    </form>
  );
}

// ---- small pieces ---------------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-[14px] bg-fill px-4 text-[16px] placeholder:text-ink-3 focus:bg-surface focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--wf-accent)_35%,transparent)] focus:outline-none"
        {...rest}
      />
      {hint && <p className="mt-1 px-1 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

function GoogleButton({ onClick, pending, label = "Continue with Google" }: { onClick: () => void; pending: boolean; label?: string }) {
  return (
    <Button type="button" variant="outline" size="lg" className="w-full" onClick={onClick} disabled={pending}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
      {pending ? "Opening Google…" : label}
    </Button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1 text-[12px] font-medium text-ink-3" role="separator">
      <span className="h-px flex-1 bg-line-strong" /> or <span className="h-px flex-1 bg-line-strong" />
    </div>
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[12px] bg-danger/10 px-3 py-2 text-[13.5px] text-danger">
      {children}
    </p>
  );
}

function Secure() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3">
      <Lock className="size-3" aria-hidden /> Secured by Firebase Authentication
    </p>
  );
}

/** Soft, slow-moving colour fields behind the frosted card. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-32 size-[560px] rounded-full bg-[#7aa7ff] opacity-30 blur-[120px] dark:opacity-25" />
      <div className="absolute top-1/3 -right-40 size-[520px] rounded-full bg-[#c4a5ff] opacity-30 blur-[120px] dark:opacity-20" />
      <div className="absolute -bottom-48 left-1/3 size-[480px] rounded-full bg-[#7fe0c0] opacity-25 blur-[120px] dark:opacity-15" />
    </div>
  );
}
