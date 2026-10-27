import { Bookmark, ChevronRight, Gift, LogOut, Settings, ShieldCheck, Trophy, UserRound, UsersRound } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/Brand";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { useDocumentTitle, useIsModerator, useMe, useSignOut } from "@/lib/hooks";

const YEAR = new Date().getFullYear();

/** Mobile "More" tab: everything that doesn't fit in the five-tab bar, grouped like iOS Settings. */
export default function More() {
  useDocumentTitle("More");
  const { data } = useMe();
  const user = data?.user;
  const signOut = useSignOut();
  const navigate = useNavigate();
  const mod = useIsModerator();
  const year = YEAR;

  const groups = [
    [
      { to: "/saved", label: "Maybe later", icon: Bookmark, tint: "bg-accent" },
      { to: "/circles", label: "Giving Circles", icon: UsersRound, tint: "bg-[#5e5ce6]" },
      { to: "/leaderboard", label: "Generosity", icon: Trophy, tint: "bg-[#ff9f0a]" },
      { to: "/wrapped", label: `${year} Wrapped`, icon: Gift, tint: "bg-[#ff375f]" },
    ],
    [{ to: "/settings", label: "Settings", icon: Settings, tint: "bg-[#8e8e93]" }, ...(mod.data ? [{ to: "/admin", label: "Moderation", icon: ShieldCheck, tint: "bg-positive" }] : [])],
  ];

  return (
    <main className="mx-auto max-w-xl px-4 pb-10 sm:px-6">
      <LargeTitle title="More" />
      {user && (
        <div className="glass-thick squircle mt-4 flex items-center gap-3.5 rounded-[22px] p-4 shadow-card">
          <Avatar seed={user.avatarSeed} name={user.displayName} photoUrl={user.photoURL} className="size-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{user.displayName}</p>
            <p className="text-[13px] text-ink-3 capitalize">{user.isDemo ? `Demo ${user.role}` : user.role}</p>
          </div>
          <ThemeToggle />
        </div>
      )}
      {groups.map((g, i) => (
        <ul key={i} className="glass-thick squircle mt-6 overflow-hidden rounded-[22px] shadow-card">
          {g.map((item, n) => (
            <li key={item.to}>
              <Link to={item.to} className="press flex items-center gap-3.5 px-4 py-3 ring-focus ring-inset">
                <span className={`grid size-8 place-items-center rounded-[9px] text-white ${item.tint}`}>
                  <item.icon className="size-[18px]" aria-hidden />
                </span>
                <span className={`flex flex-1 items-center justify-between py-0.5 text-[16px] ${n > 0 ? "" : ""}`}>
                  {item.label}
                  <ChevronRight className="size-4.5 text-ink-3" aria-hidden />
                </span>
              </Link>
              {n < g.length - 1 && <div className="ml-[60px] h-px bg-line" />}
            </li>
          ))}
        </ul>
      ))}
      <ul className="glass-thick squircle mt-6 overflow-hidden rounded-[22px] shadow-card">
        <li>
          <Link to="/login" className="press flex items-center gap-3.5 px-4 py-3.5 text-[16px] ring-focus ring-inset">
            <UserRound className="size-5 text-accent" aria-hidden /> Switch demo persona
          </Link>
        </li>
        <div className="ml-[52px] h-px bg-line" />
        <li>
          <button
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
            className="press flex w-full items-center gap-3.5 px-4 py-3.5 text-[16px] text-danger ring-focus ring-inset"
          >
            <LogOut className="size-5" aria-hidden /> Sign out
          </button>
        </li>
      </ul>
    </main>
  );
}
