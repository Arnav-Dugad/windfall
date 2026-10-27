import { prefersReducedMotion } from "@/lib/utils";

/**
 * A coin that flies along an arc from one point to the first `[data-coin-target]` progress bar on screen
 * (Web Animations API, transform/opacity only). Used for "the Give stamp morphs into a coin".
 */
export function flyCoin(from: { x: number; y: number }, opts: { delay?: number; size?: number } = {}) {
  if (prefersReducedMotion()) return;
  const start = performance.now();
  const tryLaunch = () => {
    const target = [...document.querySelectorAll<HTMLElement>("[data-coin-target]")].at(-1);
    if (!target) {
      if (performance.now() - start < 1500) requestAnimationFrame(tryLaunch);
      return;
    }
    const r = target.getBoundingClientRect();
    const to = { x: r.left + Math.max(12, r.width * 0.15), y: r.top + r.height / 2 };
    const size = opts.size ?? 30;
    const coin = document.createElement("div");
    coin.setAttribute("aria-hidden", "true");
    Object.assign(coin.style, {
      position: "fixed",
      left: `${from.x - size / 2}px`,
      top: `${from.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      zIndex: "90",
      pointerEvents: "none",
      background: "radial-gradient(circle at 35% 30%, #fff6c9, #f2c94c 45%, #c89211 100%)",
      boxShadow: "0 6px 18px rgba(200,146,17,.45), inset 0 0 0 2px rgba(255,255,255,.55)",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(coin);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lift = -Math.max(80, Math.abs(dx) * 0.35);
    const anim = coin.animate(
      [
        { transform: "translate(0,0) scale(0.6) rotateY(0deg)", opacity: 0 },
        { transform: "translate(0,0) scale(1.1) rotateY(180deg)", opacity: 1, offset: 0.12 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1) rotateY(540deg)`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotateY(900deg)`, opacity: 1, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 950, delay: opts.delay ?? 0, easing: "cubic-bezier(.45,.05,.3,1)", fill: "forwards" },
    );
    anim.onfinish = () => {
      coin.remove();
      target.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(1.9)" }, { transform: "scaleY(1)" }], { duration: 380, easing: "ease-out" });
    };
  };
  requestAnimationFrame(tryLaunch);
}
