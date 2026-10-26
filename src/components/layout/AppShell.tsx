import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Layers, LogOut, Plus, Sparkles, Trophy, UserRound, Home, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { DropdownMenu } from "radix-ui";
import { Suspense } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import type { PublicUser } from "@shared/domain";
import { Avatar } from "@/components/ui/Avatar";
import { DemoBadge } from "@/components/ui/Badge";
import { Logo, ThemeToggle } from "@/components/ui/Brand";
import { Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useMe, useSignOut } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = {
  patron: [
    { to: "/discover", label: "Discover", icon: Layers },
    { to: "/saved", label: "Maybe later", icon: Bookmark },
    { to: "/impact", label: "Impact", icon: Sparkles },
    { to: "/leaderboard", label: "Generosity", icon: Trophy },
  ],
  seeker: [
    { to: "/seeker", label: "My requests", icon: Home },
    { to: "/seeker/new", label: "New request", icon: Plus },
  ],
} as const;

export function AppShell() {
  const { data } = useMe();
  const user = data?.user ?? null;
  const items = user ? NAV[user.role] : [];
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo to={user ? (user.role === "patron" ? "/discover" : "/seeker") : "/"} />
          <DemoBadge className="hidden sm:inline-flex" />
          {items.length > 0 && (
            <nav aria-label="Primary" className="mx-auto hidden items-center gap-1 rounded-full bg-surface-2/70 p-1 md:flex">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "relative inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors ring-focus",
                      isActive ? "text-ink" : "text-ink-2 hover:text-ink",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-pill" transition={spring.snappy} className="absolute inset-0 rounded-full bg-surface shadow-sm" />
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
            <ThemeToggle />
            {user ? <AccountMenu user={user} /> : <NavLink to="/login" className="ml-2 text-[14px] font-medium ring-focus">Sign in</NavLink>}
          </div>
        </div>
      </header>

      <Suspense fallback={<PageFallback />}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={cn(items.length > 0 && "pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0")}
        >
          <Outlet />
        </motion.div>
      </Suspense>

      {items.length > 0 && <TabBar items={items} />}
    </div>
  );
}

function TabBar({ items }: { items: readonly { to: string; label: string; icon: typeof Layers }[] }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ring-focus",
                isActive ? "text-ink" : "text-ink-3",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="tab-dot" transition={spring.snappy} className="absolute top-1.5 h-1 w-6 rounded-full bg-gold" />
                )}
                <item.icon className="size-5" aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
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

  const toggleAnon = async () => {
    const { user: u } = await api.updateProfile(!user.anonymousByDefault);
    qc.setQueryData(["me"], { user: u });
    void qc.invalidateQueries({ queryKey: ["leaderboard"] });
    toast({ message: u.anonymousByDefault ? "You’ll give anonymously by default" : "Your name will show on gifts", tone: "gold" });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="ml-1 flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-surface-2 sm:pr-3 ring-focus"
          aria-label={`Account: ${user.displayName}`}
        >
          <Avatar seed={user.avatarSeed} className="size-8" monogram={false} />
          <span className="hidden text-[14px] font-medium sm:inline">{user.displayName}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-60 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-tile bg-surface p-1.5 shadow-float hairline data-[state=open]:animate-[menu-in_180ms_var(--ease-out-expo)]"
        >
          <div className="px-3 pt-2 pb-2.5">
            <p className="text-[14px] font-medium">{user.displayName}</p>
            <p className="text-[12.5px] text-ink-3 capitalize">Demo {user.role}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {user.role === "patron" && (
            <MenuItem onSelect={toggleAnon} icon={EyeOff}>
              {user.anonymousByDefault ? "Show my name on gifts" : "Give anonymously by default"}
            </MenuItem>
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
      className="flex h-10 cursor-pointer items-center gap-2.5 rounded-[12px] px-3 text-[14px] outline-none select-none data-[highlighted]:bg-surface-2"
    >
      <Icon className="size-4 text-ink-2" aria-hidden />
      {children}
    </DropdownMenu.Item>
  );
}

export function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-4 h-5 w-80 max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
