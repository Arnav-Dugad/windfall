import { Logo } from "@/components/ui/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { useDocumentTitle } from "@/lib/hooks";

export default function NotFound() {
  useDocumentTitle("Not found");
  return (
    <div className="flex min-h-dvh flex-col px-4 sm:px-6">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Logo />
      </header>
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center pb-24 text-center">
        <p className="display text-[9rem] leading-none text-gold-ink/70">404</p>
        <h1 className="display mt-4 text-display-md text-balance">This page drifted off somewhere.</h1>
        <p className="mt-4 text-[16px] text-ink-2">The link may be old, or the story may have been closed by its author.</p>
        <ButtonLink to="/" className="mt-8" size="lg">Back to Windfall</ButtonLink>
      </main>
    </div>
  );
}
