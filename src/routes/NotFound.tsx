import { m } from "motion/react";
import { Backdrop } from "@/components/ui/Backdrop";
import { Logo } from "@/components/ui/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { ease } from "@/design/motion";
import { useDocumentTitle } from "@/lib/hooks";

export default function NotFound() {
  useDocumentTitle("Not found");
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 sm:px-6">
      <Backdrop intensity={0.8} />
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center pb-24 text-center">
        <m.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: ease.outExpo }}
          className="glass-thick squircle grid size-40 place-items-center rounded-[44px] shadow-float"
        >
          <span className="display num text-[3.6rem] leading-none font-bold tracking-[-0.04em] text-ink-2">404</span>
        </m.div>
        <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: ease.outExpo }}>
          <h1 className="display mt-9 text-display-md text-balance">This page drifted off somewhere.</h1>
          <p className="mt-4 text-[16px] text-ink-2 text-pretty">The link may be old, or the story may have been closed by its author.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/" size="lg">
              Back to Give
            </ButtonLink>
            <ButtonLink to="/discover" size="lg" variant="outline">
              Meet someone
            </ButtonLink>
          </div>
        </m.div>
      </main>
    </div>
  );
}
