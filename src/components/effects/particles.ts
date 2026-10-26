/**
 * Lightweight canvas particle effects (no dependencies). A temporary full-screen canvas is created per
 * effect and removed when the last particle settles. Callers should skip these under reduced motion.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  spin: number;
  color: string;
  shape: "coin" | "rect" | "spark";
  life: number;
  maxLife: number;
}

function readVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function run(particles: Particle[], gravity: number, drag: number) {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: "none",
    zIndex: "80",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  let last = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of particles) {
      p.life += dt;
      if (p.life > p.maxLife) continue;
      alive++;
      p.vy += gravity * dt;
      p.vx *= 1 - drag * dt;
      p.vy *= 1 - drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const fade = Math.min(1, (p.maxLife - p.life) / 0.45);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "coin") {
        // Spinning coin: horizontal squash from cos(), rim + face for depth.
        const sx = Math.max(0.12, Math.abs(Math.cos(p.life * p.spin)));
        ctx.scale(sx, 1);
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (p.shape === "rect") {
        const sy = Math.cos(p.life * p.spin);
        ctx.scale(1, sy);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1 - p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
    else canvas.remove();
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}

/** Gold coins and sparks bursting from a point (e.g. the confirm button). */
export function coinBurst(x: number, y: number, intensity = 1) {
  const gold = readVar("--wf-gold", "#c3a370");
  const goldInk = readVar("--wf-gold-ink", "#7a5a26");
  const colors = [gold, gold, goldInk, "#e9d3a4"];
  const count = Math.round(26 * intensity);
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 380 + Math.random() * 520;
    ps.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: 6 + Math.random() * 6,
      rot: 0,
      vrot: (Math.random() - 0.5) * 2,
      spin: 6 + Math.random() * 10,
      color: colors[i % colors.length]!,
      shape: i % 4 === 3 ? "spark" : "coin",
      life: 0,
      maxLife: 1 + Math.random() * 0.6,
    });
  }
  return run(ps, 1500, 1.4);
}

/** Brand-colored confetti raining from the top edge and two side cannons. */
export function confetti() {
  const colors = [
    readVar("--wf-gold", "#c3a370"),
    readVar("--wf-sage", "#8aa892"),
    readVar("--wf-ink", "#111111"),
    "#efe4cf",
    readVar("--wf-gold-ink", "#7a5a26"),
  ];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ps: Particle[] = [];
  const push = (x: number, y: number, vx: number, vy: number) =>
    ps.push({
      x,
      y,
      vx,
      vy,
      size: 7 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 8,
      spin: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      shape: "rect",
      life: 0,
      maxLife: 2.6 + Math.random() * 1.4,
    });
  const n = Math.min(180, Math.round((w * h) / 9000));
  for (let i = 0; i < n * 0.4; i++) push(-10, h * 0.75, 450 + Math.random() * 650, -(650 + Math.random() * 700));
  for (let i = 0; i < n * 0.4; i++) push(w + 10, h * 0.75, -(450 + Math.random() * 650), -(650 + Math.random() * 700));
  for (let i = 0; i < n * 0.4; i++) push(Math.random() * w, -20 - Math.random() * 200, (Math.random() - 0.5) * 120, 80 + Math.random() * 120);
  return run(ps, 900, 1.6);
}
