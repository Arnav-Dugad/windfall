import { useMutation } from "@tanstack/react-query";
import { HandCoins, HeartHandshake } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import type { Role } from "@shared/domain";
import { Avatar } from "@/components/ui/Avatar";
import { Backdrop } from "@/components/ui/Backdrop";
import { Logo } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { ease, spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { homeFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** First-run choice for people who signed in with Google (or any account without a Give profile). */
export default function Welcome() {
  useDocumentTitle("Welcome");
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fb = me.firebaseUser;
  const [role, setRole] = useState<Role>("patron");
  const [name, setName] = useState(() => fb?.displayName?.split(" ")[0] ?? "");
  const done = useMutation({
    mutationFn: () => api.completeOnboarding(role, name.trim() || "Friend"),
    onSuccess: ({ user }) => {
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role), { replace: true });
    },
  });

  if (!me.isPending && me.data.user) return <Navigate to={homeFor(me.data.user.role)} replace />;
  if (!me.isPending && !fb) return <Navigate to="/login" replace />;

  const choices = [
    { value: "patron" as const, title: "I want to give", body: "Swipe through stories and clear debts.", icon: HandCoins },
    { value: "seeker" as const, title: "I need a hand", body: "Share your story and track gifts.", icon: HeartHandshake },
  ];

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Backdrop />
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-20">
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: ease.outExpo }} className="text-center">
          <Avatar seed={fb?.uid ?? "you"} name={name || "You"} photoUrl={fb?.photoURL} className="mx-auto size-20" />
          <h1 className="display mt-5 text-display-md">Welcome{name ? `, ${name}` : ""}.</h1>
          <p className="mt-2 text-[16px] text-ink-2">How will you use Give? You can’t change this later.</p>
        </m.div>
        <div className="mt-8 grid gap-3" role="radiogroup" aria-label="Role">
          {choices.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={role === c.value}
              onClick={() => setRole(c.value)}
              className={cn(
                "relative flex items-center gap-4 rounded-[22px] p-4 text-left transition-colors ring-focus",
                role === c.value ? "text-ink" : "bg-fill text-ink-2 hover:text-ink",
              )}
            >
              {role === c.value && <m.span layoutId="welcome-pick" transition={spring.snappy} className="absolute inset-0 rounded-[22px] bg-surface shadow-card ring-2 ring-accent" />}
              <span className={cn("relative grid size-12 place-items-center rounded-2xl", role === c.value ? "bg-accent text-white" : "bg-surface text-ink-2")}>
                <c.icon className="size-6" aria-hidden />
              </span>
              <span className="relative">
                <span className="block text-[17px] font-semibold">{c.title}</span>
                <span className="text-[14px] text-ink-3">{c.body}</span>
              </span>
            </button>
          ))}
        </div>
        <label className="mt-6 block">
          <span className="sr-only">First name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            maxLength={30}
            className="h-12 w-full rounded-[14px] bg-fill px-4 text-[16px] placeholder:text-ink-3 focus:bg-surface focus:outline-none"
          />
        </label>
        {done.error && (
          <p role="alert" className="mt-3 text-[14px] text-danger">
            {done.error.message}
          </p>
        )}
        <Button size="lg" className="mt-5 w-full" onClick={() => done.mutate()} disabled={done.isPending}>
          {done.isPending ? "Setting things up…" : "Continue"}
        </Button>
      </main>
    </div>
  );
}
