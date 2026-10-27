import { AnimatePresence } from "motion/react";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, type Location } from "react-router";
import { PageFallback } from "@/components/layout/PageFallback";
import Landing from "@/routes/Landing";
import { LiveAnnouncer, Toaster } from "@/components/ui/Toaster";
import { useMe } from "@/lib/hooks";
import { homeFor, loadStory } from "@/lib/routes";

// Route-level code splitting (the signed-in shell too, so the landing page stays light).
const AppShell = lazy(() => import("@/components/layout/AppShell"));
const Login = lazy(() => import("@/routes/Login"));
const Welcome = lazy(() => import("@/routes/Welcome"));
const Discover = lazy(() => import("@/routes/Discover"));
const Story = lazy(loadStory);
const StoryOverlay = lazy(() => loadStory().then((m) => ({ default: m.StoryOverlay })));
const Impact = lazy(() => import("@/routes/Impact"));
const Leaderboard = lazy(() => import("@/routes/Leaderboard"));
const Saved = lazy(() => import("@/routes/Saved"));
const SeekerDashboard = lazy(() => import("@/routes/seeker/Dashboard"));
const NewRequest = lazy(() => import("@/routes/seeker/NewRequest"));
const ManageRequest = lazy(() => import("@/routes/seeker/Manage"));
const NotFound = lazy(() => import("@/routes/NotFound"));

function RequireRole({ role, children }: { role: "patron" | "seeker"; children: ReactNode }) {
  const { data, isPending, needsOnboarding } = useMe();
  const location = useLocation();
  if (isPending) return <PageFallback />;
  if (needsOnboarding) return <Navigate to={`/welcome?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!data?.user) return <Navigate to={`/login?role=${role}&next=${encodeURIComponent(location.pathname)}`} replace />;
  if (data.user.role !== role) return <Navigate to={homeFor(data.user.role)} replace />;
  return <>{children}</>;
}

export function App() {
  const location = useLocation();
  const background = (location.state as { background?: Location } | null)?.background;

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes location={background ?? location}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<AppShell />}>
            <Route
              path="/discover"
              element={
                <RequireRole role="patron">
                  <Discover />
                </RequireRole>
              }
            />
            <Route path="/story/:id" element={<Story />} />
            <Route
              path="/impact"
              element={
                <RequireRole role="patron">
                  <Impact />
                </RequireRole>
              }
            />
            <Route
              path="/leaderboard"
              element={
                <RequireRole role="patron">
                  <Leaderboard />
                </RequireRole>
              }
            />
            <Route
              path="/saved"
              element={
                <RequireRole role="patron">
                  <Saved />
                </RequireRole>
              }
            />
            <Route
              path="/seeker"
              element={
                <RequireRole role="seeker">
                  <SeekerDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/seeker/new"
              element={
                <RequireRole role="seeker">
                  <NewRequest />
                </RequireRole>
              }
            />
            <Route
              path="/seeker/requests/:id"
              element={
                <RequireRole role="seeker">
                  <ManageRequest />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {/* Story opened from the deck renders over it, so the card can expand into the page. */}
      <AnimatePresence>
        {background && (
          <Suspense key="overlay" fallback={null}>
            <Routes location={location} key={location.pathname}>
              <Route path="/story/:id" element={<StoryOverlay />} />
            </Routes>
          </Suspense>
        )}
      </AnimatePresence>

      <Toaster />
      <LiveAnnouncer />
    </>
  );
}
