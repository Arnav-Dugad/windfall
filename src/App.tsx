import { AnimatePresence } from "motion/react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, type Location } from "react-router";
import { PageFallback } from "@/components/layout/PageFallback";
import Landing from "@/routes/Landing";
import { LiveAnnouncer, Toaster } from "@/components/ui/Toaster";
import { useMe } from "@/lib/hooks";
import { homeFor, loadStory } from "@/lib/routes";
import { startSession } from "@/lib/session";

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
const Activity = lazy(() => import("@/routes/Activity"));
const Search = lazy(() => import("@/routes/Search"));
const Circles = lazy(() => import("@/routes/Circles"));
const Circle = lazy(() => import("@/routes/Circle"));
const Match = lazy(() => import("@/routes/Match"));
const Wrapped = lazy(() => import("@/routes/Wrapped"));
const Settings = lazy(() => import("@/routes/Settings"));
const Admin = lazy(() => import("@/routes/Admin"));
const More = lazy(() => import("@/routes/More"));

// Route code downloads alongside the session instead of after it (RequireRole only renders the lazy
// page once the user is known, which would otherwise make the two load one after the other).
const ROUTE_CODE: [RegExp, () => Promise<unknown>][] = [
  [/^\/discover$/, () => import("@/routes/Discover")],
  [/^\/story\//, loadStory],
  [/^\/impact$/, () => import("@/routes/Impact")],
  [/^\/leaderboard$/, () => import("@/routes/Leaderboard")],
  [/^\/saved$/, () => import("@/routes/Saved")],
  [/^\/activity$/, () => import("@/routes/Activity")],
  [/^\/search$/, () => import("@/routes/Search")],
  [/^\/circles$/, () => import("@/routes/Circles")],
  [/^\/circles\//, () => import("@/routes/Circle")],
  [/^\/match\//, () => import("@/routes/Match")],
  [/^\/settings$/, () => import("@/routes/Settings")],
  [/^\/admin$/, () => import("@/routes/Admin")],
  [/^\/more$/, () => import("@/routes/More")],
  [/^\/wrapped$/, () => import("@/routes/Wrapped")],
  [/^\/seeker$/, () => import("@/routes/seeker/Dashboard")],
  [/^\/seeker\/new$/, () => import("@/routes/seeker/NewRequest")],
  [/^\/seeker\/requests\//, () => import("@/routes/seeker/Manage")],
];
if (typeof location !== "undefined" && location.pathname !== "/") {
  void ROUTE_CODE.find(([re]) => re.test(location.pathname))?.[1]().catch(() => undefined);
  void import("@/components/layout/AppShell").catch(() => undefined);
}

const patron = (el: ReactNode) => <RequireRole role="patron">{el}</RequireRole>;

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
  // Leaving the landing page always needs the session (main.tsx may still be holding it back).
  useEffect(() => {
    if (location.pathname !== "/") void startSession();
  }, [location.pathname]);
  const background = (location.state as { background?: Location } | null)?.background;

  return (
    <>
      {/* With a story open over it, the page behind is inert: no focus, clicks or screen-reader browsing. */}
      <div inert={!!background}>
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
              <Route path="/activity" element={patron(<Activity />)} />
              <Route path="/search" element={patron(<Search />)} />
              <Route path="/circles" element={patron(<Circles />)} />
              <Route path="/circles/:id" element={patron(<Circle />)} />
              <Route path="/match/:id" element={patron(<Match />)} />
              <Route path="/settings" element={patron(<Settings />)} />
              <Route path="/admin" element={patron(<Admin />)} />
              <Route path="/more" element={patron(<More />)} />
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
            <Route path="/wrapped" element={patron(<Wrapped />)} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>

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
