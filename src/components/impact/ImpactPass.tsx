import { Download, RotateCw } from "lucide-react";
import { m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useMemo, useState } from "react";
import { formatUSDWhole } from "@shared/money";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { barcode, memberSinceLabel, passGradient, type PassData } from "./pass";
import { cn } from "@/lib/utils";

/**
 * Apple Wallet-style impact pass. Tilts toward the pointer with a moving sheen; tap to flip to the back.
 * "Save pass" renders it to a PNG on-device.
 */
export function ImpactPass({ name, totals, memberSince }: PassData) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 220, damping: 22 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 220, damping: 22 });
  const sheenX = useTransform(px, [0, 1], [-30, 130]);
  const sheenFrom = useTransform(sheenX, (v) => v - 25);
  const sheenTo = useTransform(sheenX, (v) => v + 25);
  const sheen = useMotionTemplate`linear-gradient(115deg, transparent ${sheenFrom}%, rgba(255,255,255,0.26) ${sheenX}%, transparent ${sheenTo}%)`;
  const bars = useMemo(() => barcode(`${name}|${totals.totalCents}|${totals.giftCount}`), [name, totals.totalCents, totals.giftCount]);
  const since = memberSinceLabel(memberSince);

  const save = async () => {
    setSaving(true);
    try {
      const { renderPass } = await import("./passCard");
      const blob = await renderPass({ name, totals, memberSince });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "give-impact-pass.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ message: "Pass saved", tone: "accent" });
    } catch {
      toast({ message: "Couldn’t save the pass", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const face = "absolute inset-0 overflow-hidden rounded-[28px] text-white [backface-visibility:hidden] shadow-float";

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[330px] [perspective:1400px]">
        <m.button
          type="button"
          aria-label={flipped ? "Impact pass, back. Tap to show the front." : "Impact pass, front. Tap to show the back."}
          aria-pressed={flipped}
          onClick={() => setFlipped((f) => !f)}
          onPointerMove={(e) => {
            if (reduce || e.pointerType !== "mouse") return;
            const r = e.currentTarget.getBoundingClientRect();
            px.set((e.clientX - r.left) / r.width);
            py.set((e.clientY - r.top) / r.height);
          }}
          onPointerLeave={() => {
            px.set(0.5);
            py.set(0.5);
          }}
          style={reduce ? undefined : { rotateX, rotateY }}
          className="press relative block aspect-[0.64] w-full rounded-[28px] text-left [transform-style:preserve-3d] ring-focus"
        >
          <m.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18 }}
            className="absolute inset-0 [transform-style:preserve-3d]"
          >
            {/* Front */}
            <div className={face} style={{ background: passGradient }}>
              <m.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: sheen }} />
              <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-white/15 blur-3xl" />
              <div className="relative flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
                    <span className="grid size-7 place-items-center rounded-[9px] bg-white/20 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,.4)]">
                      <span className="size-2.5 rounded-full bg-white" />
                    </span>
                    Give
                  </span>
                  <span className="text-[10.5px] font-semibold tracking-[0.16em] text-white/75 uppercase">Impact pass</span>
                </div>

                <div className="mt-7">
                  <p className="text-[10.5px] font-semibold tracking-[0.14em] text-white/70 uppercase">Total given</p>
                  <p className="num mt-1 text-[2.6rem] leading-none font-bold tracking-[-0.03em]">{formatUSDWhole(totals.totalCents)}</p>
                </div>

                <dl className="mt-6 grid grid-cols-3 gap-2">
                  <Field label="People" value={totals.peopleHelped} />
                  <Field label="Cleared" value={totals.debtsCleared} />
                  <Field label="Streak" value={`${totals.streakWeeks} wk`} />
                </dl>

                <div className="mt-6">
                  <p className="text-[10.5px] font-semibold tracking-[0.14em] text-white/70 uppercase">Holder</p>
                  <p className="mt-0.5 truncate text-[18px] font-semibold">{name}</p>
                </div>

                <div className="mt-auto rounded-[14px] bg-white px-3 pt-3 pb-2 text-center">
                  <svg viewBox={`0 0 ${bars.reduce((s, w) => s + w + 1, 0)} 40`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
                    {bars.reduce<{ x: number; els: React.ReactNode[] }>(
                      (acc, w, i) => {
                        if (i % 2 === 0) acc.els.push(<rect key={i} x={acc.x} y={0} width={w} height={40} fill="#111" />);
                        acc.x += w + 1;
                        return acc;
                      },
                      { x: 0, els: [] },
                    ).els}
                  </svg>
                  <p className="num mt-1 text-[10.5px] font-medium tracking-[0.12em] text-black/55 uppercase">Member since {since}</p>
                </div>
              </div>
            </div>

            {/* Back */}
            <div className={cn(face, "[transform:rotateY(180deg)]")} style={{ background: "linear-gradient(160deg, #1d1d1f, #2c2c30 60%, #1d1d1f)" }}>
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ background: passGradient, maskImage: "linear-gradient(to bottom, black, transparent 45%)" }} />
              <div className="relative flex h-full flex-col p-5">
                <p className="text-[10.5px] font-semibold tracking-[0.16em] text-white/60 uppercase">Pass details</p>
                <dl className="mt-4 divide-y divide-white/10 text-[14px]">
                  <Row label="Generosity Index" value={totals.generosityIndex.toLocaleString("en-US")} />
                  <Row label="Gifts" value={totals.giftCount.toLocaleString("en-US")} />
                  <Row label="Countries reached" value={totals.countries.toLocaleString("en-US")} />
                  <Row label="Debts fully cleared" value={totals.debtsCleared.toLocaleString("en-US")} />
                  <Row label="Giving streak" value={`${totals.streakWeeks} ${totals.streakWeeks === 1 ? "week" : "weeks"}`} />
                  <Row label="Member since" value={since} />
                </dl>
                <p className="mt-auto text-[12px] leading-relaxed text-white/55">
                  A keepsake of what your generosity changed — not a payment card. Every dollar on Give is demo money.
                </p>
              </div>
            </div>
          </m.div>
        </m.button>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="quiet" size="sm" onClick={() => setFlipped((f) => !f)}>
          <RotateCw className="size-3.5" aria-hidden /> Flip
        </Button>
        <Button variant="outline" size="sm" onClick={() => void save()} disabled={saving}>
          <Download className="size-3.5" aria-hidden /> {saving ? "Saving…" : "Save pass"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[12px] bg-white/14 px-2.5 py-2 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,.25)]">
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase">{label}</dt>
      <dd className="num mt-0.5 text-[18px] font-semibold">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-white/65">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}
