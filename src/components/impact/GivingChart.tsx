import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { formatCompactUSD, formatUSD } from "@shared/money";
import { ease } from "@/design/motion";
import { cn } from "@/lib/utils";

const fmtWeek = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Single-series weekly bars: thin marks, rounded data ends on the baseline, recessive grid, hover tooltip. */
export function GivingChart({ series }: { series: { weekStart: number; totalCents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const max = useMemo(() => niceMax(Math.max(1, ...series.map((s) => s.totalCents))), [series]);
  const ticks = [0, max / 2, max];
  const W = 640;
  const H = 220;
  const padL = 44;
  const padB = 24;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / series.length;
  const barW = Math.max(4, slot - 6);
  const active = hover !== null ? series[hover] : null;

  return (
    <figure aria-labelledby={titleId} className="relative">
      <figcaption id={titleId} className="sr-only">
        Weekly giving over the last {series.length} weeks
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-hidden onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = 8 + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--wf-line)" strokeWidth={1} />
              <text x={padL - 10} y={y + 4} textAnchor="end" className="fill-ink-3 text-[11px] num">
                {t === 0 ? "$0" : formatCompactUSD(t)}
              </text>
            </g>
          );
        })}
        {series.map((s, i) => {
          const h = s.totalCents > 0 ? Math.max(3, (s.totalCents / max) * plotH) : 0;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = 8 + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={s.weekStart}>
              {h > 0 && (
                <motion.path
                  d={`M${x},${8 + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${8 + plotH} Z`}
                  fill="var(--wf-chart)"
                  initial={{ scaleY: 0, opacity: 0 }}
                  whileInView={{ scaleY: 1, opacity: hover === null || hover === i ? 1 : 0.45 }}
                  viewport={{ once: true }}
                  style={{ originY: 1, transformBox: "fill-box" }}
                  transition={{ duration: 0.9, delay: i * 0.02, ease: ease.outExpo }}
                />
              )}
              {/* Hit target larger than the mark */}
              <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onPointerEnter={() => setHover(i)} />
              {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" className="fill-ink-3 text-[11px]">
                  {fmtWeek(s.weekStart)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <AnimatePresence>
        {active && hover !== null && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn("pointer-events-none absolute top-0 z-10 rounded-[12px] bg-ink px-3 py-2 text-[12.5px] text-on-ink shadow-float")}
            style={{
              left: `${((padL + hover * slot + slot / 2) / W) * 100}%`,
              transform: `translateX(${hover > series.length * 0.7 ? "-100%" : hover < series.length * 0.2 ? "0%" : "-50%"})`,
            }}
          >
            <div className="opacity-70">Week of {fmtWeek(active.weekStart)}</div>
            <div className="num font-medium">{formatUSD(active.totalCents)}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <details className="mt-3 text-[13px] text-ink-2">
        <summary className="cursor-pointer rounded select-none ring-focus">View as table</summary>
        <table className="mt-3 w-full text-left num">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 font-normal">Week of</th>
              <th className="py-1 text-right font-normal">Given</th>
            </tr>
          </thead>
          <tbody>
            {series
              .filter((s) => s.totalCents > 0)
              .map((s) => (
                <tr key={s.weekStart} className="border-t border-line">
                  <td className="py-1.5">{fmtWeek(s.weekStart)}</td>
                  <td className="py-1.5 text-right">{formatUSD(s.totalCents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * exp;
}
