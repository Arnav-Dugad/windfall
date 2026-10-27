import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, Ellipsis, EyeOff, Gift, Home, Layers, LogOut, Plus, Search, Settings, ShieldCheck, Sparkles, Trophy, UserRound, UsersRound } from "lucide-react";
import { m } from "motion/react";
import { DropdownMenu } from "radix-ui";
import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import type { PublicUser } from "@shared/domain";
import { Avatar } from "@/components/ui/Avatar";
import { DemoBadge } from "@/components/ui/Badge";
import { Logo, ThemeToggle } from "@/components/ui/Brand";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useIdleReady, useIsModerator, useMe, useSignOut } from "@/lib/hooks";
import { notify } from "@/lib/notify";
import { activity } from "@/lib/social";
import { cn } from "@/lib/utils";
import { PageFallback } from "./PageFallback";

const YEAR = new Date().getFullYear();

type NavItem = { to: string; label: string; icon: typeof Layers; badge?: boolean };

const NAV: Record<"patron" | "seeker", readonly NavItem[]> = {
  patron: [
    { to: "/discover", label: "Discover", icon: Layers },
    { to: "/search", label: "Search", icon: Search },
    { to: "/circles", label: "Circles", icon: UsersRound },
    { to: "/impact", label: "Impact", icon: Sparkles },
    { to: "/leaderboard", label: "Generosity", icon: Trophy },
  ],
  seeker: [
    { to: "/seeker", label: "My requests", icon: Home },
    { to: "/seeker/new", label: "New request", icon: Plus },
  ],
};

/** Phones get five tabs; the rest of the patron pages live under More. */
const TABS: Record<"patron" | "seeker", readonly NavItem[]> = {
  patron: [
    { to: "/discover", label: "Discover", icon: Layers },
    { to: "/search", label: "Search", icon: Search },
    { to: "/activity", label: "Activity", icon: Bell, badge: true },
    { to: "/impact", label: "Impact", icon: Sparkles },
    { to: "/more", label: "More", icon: Ellipsis },
  ],
  seeker: NAV.seeker,
};

/** Unread activity for the bell/tab badge, refreshed every couple of minutes; new items can raise a notification. */
function useUnread(enabled: boolean) {
  // The badge waits until the page has settled so its reads never hold up the deck.
  const settled = useIdleReady();
  const q = useQuery({ queryKey: ["activity"], queryFn: activity, enabled: enabled && settled, staleTime: 60_000, refetchInterval: 120_000, refetchOnWindowFocus: true });
  useEffect(() => {
    for (const it of q.data?.items ?? []) if (it.unread) notify(it.id, it.title, it.body, it.card.photoUrl);
  }, [q.data]);
  return q.data?.unread ?? 0;
}

export default function AppShell() {
  const { data } = useMe();
  const user = data?.user ?? null;
  const items = user ? NAV[user.role] : [];
  const tabs = user ? TABS[user.role] : [];
  const location = useLocation();
  const unread = useUnread(user?.role === "patron");

  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-40 !shadow-[0_0.5px_0_var(--wf-line-strong)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo to={user ? (user.role === "patron" ? "/discover" : "/seeker") : "/"} />
          <DemoBadge className="hidden sm:inline-flex" />
          {items.length > 0 && (
            <nav aria-label="Primary" className="mx-auto hidden items-center gap-0.5 rounded-full bg-fill p-1 md:flex">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ring-focus",
                      isActive ? "text-ink" : "text-ink-2 hover:text-ink",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <m.span layoutId="nav-pill" transition={spring.snappy} className="absolute inset-0 rounded-full bg-surface shadow-sm dark:bg-surface-2" />
                      )}
                      <item.icon className="relative size-4" aria-hidden />
                      <span className="relative">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <DemoBadge className="sm:hidden" label="Demo" />
            {user?.role === "patron" && (
              <Link
                to="/activity"
                className="press relative hidden size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-fill hover:text-ink md:grid ring-focus"
                aria-label={unread ? `Activity, ${unread} unread` : "Activity"}
              >
                <Bell className="size-[18px]" aria-hidden />
                {unread > 0 && <Badge n={unread} className="absolute top-0.5 right-0.5" />}
              </Link>
            )}
            <ThemeToggle />
            {user ? <AccountMenu user={user} /> : <NavLink to="/login" className="ml-2 text-[14px] font-medium ring-focus">Sign in</NavLink>}
          </div>
        </div>
      </header>

      <Suspense fallback={<PageFallback />}>
        <m.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={cn(items.length > 0 && "pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-0")}
        >
          <Outlet />
        </m.div>
      </Suspense>

      {tabs.length > 0 && <TabBar items={tabs} unread={unread} />}
    </div>
  );
}

function Badge({ n, className }: { n: number; className?: string }) {
  return (
    <m.span
      key={n}
      initial={{ scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={spring.snappy}
      className={cn("grid h-4 min-w-4 place-items-center rounded-full bg-[#ff3b30] px-1 text-[10px] leading-none font-bold text-white ring-2 ring-canvas num", className)}
      aria-hidden
    >
      {n > 9 ? "9+" : n}
    </m.span>
  );
}

function TabBar({ items, unread }: { items: readonly NavItem[]; unread: number }) {
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
    >
      <div className="glass-thick pointer-events-auto flex w-full max-w-md items-stretch justify-around rounded-full p-1.5 shadow-float">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "relative flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold transition-colors ring-focus",
                isActive ? "text-accent" : "text-ink-2",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <m.span layoutId="tab-dot" transition={spring.snappy} className="absolute inset-0 rounded-full bg-fill" />
                )}
                <span className="relative">
                  <item.icon className="size-[22px]" aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
                  {item.badge && unread > 0 && <Badge n={unread} className="absolute -top-1 -right-2" />}
                </span>
                <span className="relative">{item.label}</span>
                {item.badge && unread > 0 && <span className="sr-only">, {unread} unread</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function AccountMenu({ user }: { user: PublicUser }) {
  const signOut = useSignOut();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mod = useIsModerator(useIdleReady());
  const year = YEAR;

  const toggleAnon = async () => {
    try {
      const { user: u } = await api.updateProfile(!user.anonymousByDefault);
      qc.setQueryData(["me"], { user: u });
      void qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast({ message: u.anonymousByDefault ? "You’ll give anonymously by default" : "Your name will show on gifts", tone: "accent" });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn’t change that — please try again", tone: "danger" });
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="ml-1 flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-fill sm:pr-3 ring-focus"
          aria-label={`Account: ${user.displayName}`}
        >
          <Avatar seed={user.avatarSeed} name={user.displayName} photoUrl={user.photoURL} className="size-8" />
          <span className="hidden text-[14px] font-semibold sm:inline">{user.displayName}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="glass-thick z-50 min-w-60 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-[18px] p-1.5 shadow-float data-[state=open]:animate-[menu-in_180ms_var(--ease-out-expo)]"
        >
          <div className="px-3 pt-2 pb-2.5">
            <p className="text-[14px] font-medium">{user.displayName}</p>
            <p className="text-[12.5px] text-ink-3 capitalize">{user.isDemo ? `Demo ${user.role}` : user.role}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {user.role === "patron" && (
            <>
              <MenuItem onSelect={() => navigate("/saved")} icon={Bookmark}>
                Maybe later
              </MenuItem>
              <MenuItem onSelect={() => navigate("/wrapped")} icon={Gift}>
                {year} Wrapped
              </MenuItem>
              <MenuItem onSelect={() => navigate("/settings")} icon={Settings}>
                Settings
              </MenuItem>
              {mod.data && (
                <MenuItem onSelect={() => navigate("/admin")} icon={ShieldCheck}>
                  Moderation
                </MenuItem>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <MenuItem onSelect={toggleAnon} icon={EyeOff}>
                {user.anonymousByDefault ? "Show my name on gifts" : "Give anonymously by default"}
              </MenuItem>
            </>
          )}
          <MenuItem onSelect={() => navigate("/login")} icon={UserRound}>
            Switch demo persona
          </MenuItem>
          <MenuItem
            onSelect={async () => {
              await signOut();
              navigate("/");
            }}
            icon={LogOut}
          >
            Sign out
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ children, onSelect, icon: Icon }: { children: React.ReactNode; onSelect: () => void; icon: typeof Layers }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-2.5 rounded-[12px] px-3 text-[14px] outline-none select-none data-[highlighted]:bg-fill"
    >
      <Icon className="size-4 text-ink-2" aria-hidden />
      {children}
    </DropdownMenu.Item>
  );
}
