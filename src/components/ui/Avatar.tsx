import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

// Generated, deterministic portraits: a warm tonal field, soft geometric forms and a serif monogram.
// No faces, no stock photos — dignified and consistent with the brand.

const PALETTES = [
  ["#e9dccb", "#c9a77c", "#8c6a43"], // sand
  ["#dfe6dc", "#9fb59f", "#56705a"], // sage
  ["#e6dad5", "#c39b8c", "#7f5546"], // clay
  ["#dcdde4", "#9ea3b8", "#535a76"], // slate
  ["#e7dde3", "#b997aa", "#71506a"], // plum
  ["#ece2c9", "#cdb06a", "#806727"], // ochre
  ["#d9e2df", "#89aaa1", "#3f6159"], // eucalyptus
  ["#e9d9cf", "#d0a088", "#8b5a45"], // terracotta
] as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function avatarPalette(seed: string) {
  return PALETTES[hash(seed) % PALETTES.length]!;
}

interface AvatarProps {
  seed: string;
  name?: string;
  photoUrl?: string | null;
  blur?: boolean;
  className?: string;
  /** Rounded square for cards; circle for lists. */
  shape?: "circle" | "card";
  monogram?: boolean;
  /** Load immediately (top-of-deck / hero images). */
  priority?: boolean;
}

export const Avatar = memo(function Avatar({
  seed,
  name,
  photoUrl,
  blur,
  className,
  shape = "circle",
  monogram = true,
  priority = false,
}: AvatarProps) {
  const art = useMemo(() => {
    const h = hash(seed);
    const [bg, mid, deep] = avatarPalette(seed);
    const r = (n: number, mod: number) => ((h >>> n) % mod) / mod;
    return {
      bg,
      mid,
      deep,
      c1: { cx: 20 + r(3, 60) * 60, cy: 18 + r(7, 50) * 40, r: 30 + r(11, 20) * 20 },
      c2: { cx: 30 + r(13, 50) * 50, cy: 70 + r(17, 30) * 30, r: 24 + r(19, 20) * 18 },
      arc: r(23, 4),
      rot: Math.round(r(5, 360) * 360),
    };
  }, [seed]);

  const initial = name?.trim()[0]?.toUpperCase();
  const anonymous = seed === "anonymous";
  const id = `av-${hash(seed).toString(36)}`;

  return (
    <div
      className={cn(
        "@container relative isolate overflow-hidden",
        shape === "circle" ? "rounded-full" : "rounded-[inherit]",
        className,
      )}
      aria-hidden={!name}
      role={name ? "img" : undefined}
      aria-label={name ? `${name}’s portrait` : undefined}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className={cn("size-full object-cover select-none", blur && "scale-125 blur-2xl")}
        />
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="size-full">
          <defs>
            <radialGradient id={`${id}-g`} cx="30%" cy="25%" r="90%">
              <stop offset="0%" stopColor={anonymous ? "#d8d2c8" : art.bg} />
              <stop offset="100%" stopColor={anonymous ? "#bdb5a8" : art.mid} stopOpacity="0.9" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${id}-g)`} />
          {!anonymous && (
            <g transform={`rotate(${art.rot} 50 50)`} opacity="0.9">
              <circle {...art.c1} fill={art.mid} opacity="0.55" />
              <circle {...art.c2} fill={art.deep} opacity="0.28" />
              {art.arc > 0.5 && (
                <path d="M10 70 Q 50 30 90 70" stroke={art.deep} strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
              )}
            </g>
          )}
        </svg>
      )}
      {monogram && !photoUrl && initial && (
        <span
          className="display absolute inset-0 grid place-items-center leading-none text-white/90"
          style={{ fontSize: shape === "card" ? "34cqw" : "48cqw" }}
        >
          {anonymous ? "·" : initial}
        </span>
      )}
    </div>
  );
});
