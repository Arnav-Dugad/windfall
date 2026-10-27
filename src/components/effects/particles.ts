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
  shape: "coin" | "circle" | "squircle" | "spark";
  /** 0 = far (small, blurred, slow) … 1 = near (crisp). */
  depth: number;
  life: number;
  maxLife: number;
}

function readVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Superellipse-ish rounded square, the shape of an iOS icon. */
function squirclePath(ctx: CanvasRenderingContext2D, s: number) {
  const r = s * 0.42;
  const h = s / 2;
  ctx.beginPath();
  ctx.moveTo(-h + r, -h);
  ctx.lineTo(h - r, -h);
  ctx.bezierCurveTo(h, -h, h, -h, h, -h + r);
  ctx.lineTo(h, h - r);
  ctx.bezierCurveTo(h, h, h, h, h - r, h);
  ctx.lineTo(-h + r, h);
  ctx.bezierCurveTo(-h, h, -h, h, -h, h - r);
  ctx.lineTo(-h, -h + r);
  ctx.bezierCurveTo(-h, -h, -h, -h, -h + r, -h);
  ctx.closePath();
}

// Shapes are pre-rendered once per (shape, colour, blur level) into small sprites and stamped each frame with
// drawImage. Blurring every particle with ctx.filter on every frame is a software path that can take whole
// seconds per frame with a few hundred pieces — enough to freeze the page.
const R = 16; // sprite radius, in sprite units (a particle of size s is drawn at scale s / R)
const SS = 2; // sprite supersampling, so they stay crisp on 2× screens
const sprites = new Map<string, HTMLCanvasElement>();

function sprite(shape: Particle["shape"], color: string, blurLevel: number) {
  const key = `${shape}|${color}|${blurLevel}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const blur = blurLevel * 2; // in sprite units (a typical particle is about half the sprite's size)
  const half = R * (shape === "squircle" ? 0.75 : 1) + blur * 3 + 2;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(half * 2 * SS);
  const g = c.getContext("2d")!;
  g.scale(SS, SS);
  g.translate(half, half);
  if (blur) g.filter = `blur(${blur}px)`;
  g.fillStyle = color;
  if (shape === "coin") {
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = R / 8;
    g.stroke();
  } else if (shape === "squircle") {
    squirclePath(g, R * 1.4);
    g.fill();
  } else {
    g.beginPath();
    g.arc(0, 0, shape === "circle" ? R * 0.7 : R, 0, Math.PI * 2);
    g.fill();
  }
  sprites.set(key, c);
  return c;
}

function run(particles: Particle[], gravity: number, drag: number) {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: `${w}px`, height: `${h}px`, pointerEvents: "none", zIndex: "80" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  // Far particles first, so near ones paint over them.
  particles.sort((a, b) => a.depth - b.depth);
  // Depth blur (far pieces are softer), quantised to a few sprite levels.
  const art = particles.map((p) => {
    const blur = (1 - p.depth) * 3;
    return sprite(p.shape, p.color, blur > 0.4 ? Math.max(1, Math.round(blur)) : 0);
  });

  let last = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      p.life += dt;
      if (p.life > p.maxLife) continue;
      alive++;
      const speed = 0.55 + p.depth * 0.45; // parallax: distant pieces drift slower
      p.vy += gravity * dt * speed;
      p.vx *= 1 - drag * dt;
      p.vy *= 1 - drag * dt;
      p.x += p.vx * dt * speed;
      p.y += p.vy * dt * speed;
      p.rot += p.vrot * dt;
      const fade = Math.min(1, (p.maxLife - p.life) / 0.45);
      const s = p.size * (0.55 + p.depth * 0.6);
      // Spin as a squash on one axis: coins and circles turn edge-on, squircles flip.
      let sx = 1;
      let sy = 1;
      let k = s / R;
      if (p.shape === "coin") sx = Math.max(0.12, Math.abs(Math.cos(p.life * p.spin)));
      else if (p.shape === "squircle") sy = Math.cos(p.life * p.spin);
      else if (p.shape === "circle") sx = Math.cos(p.life * p.spin) * 0.5 + 0.5;
      else k *= 1 - p.life / p.maxLife; // sparks shrink away
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const scale = (k * dpr) / SS;
      ctx.setTransform(cos * sx * scale, sin * sx * scale, -sin * sy * scale, cos * sy * scale, p.x * dpr, p.y * dpr);
      ctx.globalAlpha = fade * (0.55 + p.depth * 0.45);
      const img = art[i]!;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
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

const COIN = ["#f2c94c", "#e3b341", "#ffd96b", "#c89211"];

/** Gold coins and sparks bursting from a point (e.g. the confirm button). */
export function coinBurst(x: number, y: number, intensity = 1) {
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
      size: 7 + Math.random() * 6,
      rot: 0,
      vrot: (Math.random() - 0.5) * 2,
      spin: 6 + Math.random() * 10,
      color: COIN[i % COIN.length]!,
      shape: i % 4 === 3 ? "spark" : "coin",
      depth: 0.5 + Math.random() * 0.5,
      life: 0,
      maxLife: 1 + Math.random() * 0.6,
    });
  }
  return run(ps, 1500, 1.4);
}

/** Apple-style confetti: circles and squircles in system colours, with depth blur and parallax. */
export function confetti() {
  const colors = [
    readVar("--wf-accent", "#0071e3"),
    readVar("--wf-positive", "#34c759"),
    "#ff9f0a",
    "#ff375f",
    "#bf5af2",
    "#64d2ff",
    "#ffd60a",
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
      size: 8 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 6,
      spin: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      shape: Math.random() < 0.5 ? "circle" : "squircle",
      depth: Math.random(),
      life: 0,
      maxLife: 2.8 + Math.random() * 1.4,
    });
  const n = Math.min(200, Math.round((w * h) / 8000));
  for (let i = 0; i < n * 0.4; i++) push(-10, h * 0.75, 450 + Math.random() * 650, -(650 + Math.random() * 700));
  for (let i = 0; i < n * 0.4; i++) push(w + 10, h * 0.75, -(450 + Math.random() * 650), -(650 + Math.random() * 700));
  for (let i = 0; i < n * 0.4; i++) push(Math.random() * w, -20 - Math.random() * 200, (Math.random() - 0.5) * 120, 80 + Math.random() * 120);
  return run(ps, 900, 1.6);
}
