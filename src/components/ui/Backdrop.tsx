import { useState } from "react";
import { cn } from "@/lib/utils";

type Period = "dawn" | "day" | "dusk" | "night";

/** Three soft colour fields per time of day. Gradients, not blur filters, so they cost almost nothing to paint. */
const PALETTES: Record<Period, [string, string, string]> = {
  dawn: ["#ffb38a", "#f7a1c4", "#9ec5ff"],
  day: ["#7aa7ff", "#c4a5ff", "#7fe0c0"],
  dusk: ["#ff8a65", "#b388ff", "#5c7cfa"],
  night: ["#3d5afe", "#7c4dff", "#00bfa5"],
};

/** Seasonal hue shift (northern-hemisphere months): cooler winters, warmer autumns. */
const SEASON_HUE = [-18, -18, 12, 12, 12, 0, 0, 0, -32, -32, -32, -18] as const;

/** Rotate a hex colour's hue (HSL) — done here rather than with a CSS filter, which would re-filter every frame. */
function shiftHue(hex: string, deg: number) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}

function period(h: number): Period {
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 21) return "dusk";
  return "night";
}

const CSS = `
@keyframes wf-drift-a { from { transform: translate3d(0,0,0) scale(1) } to { transform: translate3d(6%,8%,0) scale(1.12) } }
@keyframes wf-drift-b { from { transform: translate3d(0,0,0) scale(1.05) } to { transform: translate3d(-8%,-5%,0) scale(0.95) } }
@keyframes wf-drift-c { from { transform: translate3d(0,0,0) scale(0.95) } to { transform: translate3d(5%,-7%,0) scale(1.1) } }
.wf-blob { position: absolute; border-radius: 9999px; will-change: transform; }
.wf-blob-a { animation: wf-drift-a 26s ease-in-out infinite alternate; }
.wf-blob-b { animation: wf-drift-b 32s ease-in-out infinite alternate; }
.wf-blob-c { animation: wf-drift-c 38s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .wf-blob { animation: none !important; } }
`;

/**
 * Ambient backdrop: time-of-day palette crossed with a seasonal hue shift, drifting slowly (CSS only).
 * In dark mode the canvas stays OLED black and the fields drop to a faint glow.
 * Place inside a `relative` container; it sits behind content (-z-10).
 */
export function Backdrop({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const [now] = useState(() => new Date());
  const p = period(now.getHours());
  const [a, b, c] = PALETTES[p];
  const hue = SEASON_HUE[now.getMonth()] ?? 0;
  const field = (color: string) => ({ background: `radial-gradient(closest-side, ${shiftHue(color, hue)}, transparent)` });
  return (
    <div
      aria-hidden
      data-period={p}
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <style href="wf-backdrop" precedence="low">
        {CSS}
      </style>
      <div className="opacity-(--wf-bd) dark:opacity-[calc(var(--wf-bd)*0.55)]" style={{ ["--wf-bd" as string]: String(0.55 * intensity) }}>
        <div className="wf-blob wf-blob-a -top-48 -left-40 size-[680px]" style={field(a)} />
        <div className="wf-blob wf-blob-b top-1/4 -right-48 size-[620px]" style={field(b)} />
        <div className="wf-blob wf-blob-c -bottom-56 left-1/4 size-[560px]" style={field(c)} />
      </div>
    </div>
  );
}
