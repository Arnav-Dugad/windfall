import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatUSD } from "@shared/money";
import { WORLD_DOTS } from "@/data/world-dots";
import type { Impact } from "@/lib/api";

type Place = Impact["places"][number];

/** Dotted world map with a glowing marker wherever this Patron's money went. Markers are focusable. */
export function ImpactMap({ places }: { places: Place[] }) {
  const [active, setActive] = useState<Place | null>(null);
  const { width: W, height: H, step, latMax } = WORLD_DOTS;
  const project = (lat: number, lng: number) => ({ x: (lng + 180) / step - 0.5, y: (latMax - lat) / step });
  const maxCents = Math.max(1, ...places.map((p) => p.totalCents));

  return (
    <div className="relative">
      <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="w-full" role="group" aria-label="Map of places you’ve given to">
        <path
          d={WORLD_DOTS.path}
          stroke="var(--wf-line-strong)"
          strokeWidth={0.62}
          strokeLinecap="round"
          strokeDasharray="0 1"
          fill="none"
          aria-hidden
        />
        {places.map((p, i) => {
          const { x, y } = project(p.lat, p.lng);
          const r = 0.6 + Math.sqrt(p.totalCents / maxCents) * 0.9;
          const isActive = active === p;
          return (
            <g
              key={`${p.city}-${p.countryCode}`}
              tabIndex={0}
              role="button"
              aria-label={`${p.city}, ${p.country}: ${formatUSD(p.totalCents)} to ${p.people.join(", ")}`}
              onPointerEnter={() => setActive(p)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(p)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none"
            >
              <circle cx={x} cy={y} r={r * 2.2} fill="var(--wf-chart)" opacity={0.16} className="motion-safe:animate-breathe" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.3}s` }} />
              <motion.circle
                cx={x}
                cy={y}
                r={r}
                fill="var(--wf-chart)"
                initial={{ scale: 0 }}
                whileInView={{ scale: isActive ? 1.35 : 1 }}
                viewport={{ once: false }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: isActive ? 0 : 0.2 + i * 0.05 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
              />
              {/* Visible focus/hover ring (the group itself has no outline) */}
              {isActive && <circle cx={x} cy={y} r={r * 2} fill="none" stroke="var(--wf-ink)" strokeWidth={0.22} />}
              <circle cx={x} cy={y} r={Math.max(3, r * 2)} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.city}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute z-10 min-w-40 rounded-[12px] bg-ink px-3 py-2 text-[12.5px] text-on-ink shadow-float"
            style={{
              left: `${(project(active.lat, active.lng).x / W) * 100}%`,
              top: `${(project(active.lat, active.lng).y / H) * 100}%`,
              transform: `translate(${active.lng > 60 ? "-105%" : "8%"}, -50%)`,
            }}
          >
            <div className="font-medium">
              {active.city}, {active.country}
            </div>
            <div className="num opacity-80">
              {formatUSD(active.totalCents)} · {active.people.join(", ")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
