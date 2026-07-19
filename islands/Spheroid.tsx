/**
 * Spheroid — the quaternary spheroid in the prolegomenon hero.
 *
 * An invented compound. Not a real substance, and deliberately so: a fictional
 * 4-substituted tryptamine, drawn as a fable rather than a formula.
 *
 * Its architecture is the argument. An indole core carries, at position 4, a
 * QUATERNARY CARBON — four substituents, which is what the word means in
 * chemistry, and why the sigil reads IV. That carbon is a hinge. Two arms hang
 * from it:
 *
 *   · the POSSIBILITY arm (saffron), displaced to +w
 *   · the DESIRE arm      (rose),    displaced to -w
 *
 * The two forces sit on opposite sides of the fourth dimension and cannot
 * reach one another. The quaternary carbon lies at w = 0 — the single place
 * they meet. It is the force-point of habit, and it is drawn in the same cyan
 * as the intersection in the figure beside it.
 *
 * The molecule exists in 4-space; we only ever see its shadow. It is rotated
 * through two independent planes and projected 4D -> 3D -> 2D, so the arms
 * swing through each other without ever touching, and the hinge holds.
 *
 * Decorative — aria-hidden, and it settles to a single static frame for
 * visitors who prefer reduced motion.
 */

import { useEffect, useRef } from 'preact/hooks';

const TAU = Math.PI * 2;

const CORE = '#5d5647'; // indole scaffold — ink, muted
const DESIRE = '#a83b5b'; // rose    — matches the desire line in the figure
const POSSIBILITY = '#d96512'; // saffron — matches f(x)
const HABIT = '#078f9a'; // cyan    — matches the force-point

type Arm = 'core' | 'desire' | 'possibility' | 'hinge';

interface Atom {
  /** position in 4-space */
  p: [number, number, number, number];
  arm: Arm;
  /** heteroatoms render a touch larger */
  heavy?: boolean;
}

/*
 * The indole core lies flat (z ≈ 0) and at w ≈ 0 — it is the shared body, the
 * part both forces have in common. The arms are what diverge, and they diverge
 * in w: the dimension neither can see the other across.
 */
const ATOMS: Atom[] = [
  // indole core — benzene fused to pyrrole
  { p: [0, 0, 0, 0], arm: 'core' }, // 0  C3a
  { p: [-0.87, 0.5, 0, 0], arm: 'core' }, // 1  C4  <- substituted here
  { p: [-1.73, 0, 0, 0], arm: 'core' }, // 2  C5
  { p: [-1.73, -1.0, 0, 0], arm: 'core' }, // 3  C6
  { p: [-0.87, -1.5, 0, 0], arm: 'core' }, // 4  C7
  { p: [0, -1.0, 0, 0], arm: 'core' }, // 5  C7a
  { p: [0.95, -1.31, 0, 0], arm: 'core', heavy: true }, // 6  N1
  { p: [1.54, -0.5, 0, 0], arm: 'core' }, // 7  C2
  { p: [0.95, 0.31, 0, 0], arm: 'core' }, // 8  C3

  // the quaternary carbon: four substituents, at w = 0. the hinge.
  { p: [-1.5, 1.5, 0, 0], arm: 'hinge', heavy: true }, // 9  Q

  // possibility arm — pushed into +w
  { p: [-2.4, 2.2, 0.3, 0.55], arm: 'possibility', heavy: true }, // 10 O
  { p: [-2.2, 3.4, -0.2, 0.85], arm: 'possibility', heavy: true }, // 11 P
  { p: [-3.2, 4.1, 0.4, 1.0], arm: 'possibility', heavy: true }, // 12 O
  { p: [-1.2, 4.1, -0.8, 1.0], arm: 'possibility', heavy: true }, // 13 O

  // desire arm — pushed into -w
  { p: [-0.6, 2.4, -0.4, -0.55], arm: 'desire' }, // 14 Cβ
  { p: [0.5, 2.2, 0.4, -0.7], arm: 'desire' }, // 15 Cα
  { p: [1.3, 3.2, 0, -0.9], arm: 'desire', heavy: true }, // 16 N
  { p: [2.4, 2.9, -0.4, -1.0], arm: 'desire' }, // 17 methyl
  { p: [1.0, 4.3, 0.6, -1.0], arm: 'desire' }, // 18 methyl

  // the fourth substituent on the hinge, holding it in place
  { p: [-2.2, 0.9, -1.1, 0], arm: 'hinge' }, // 19 methyl
];

const BONDS: [number, number][] = [
  // benzene
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  // pyrrole
  [0, 8], [8, 7], [7, 6], [6, 5],
  // the quaternary carbon's four substituents: core, possibility, desire, methyl
  [1, 9], [9, 10], [9, 14], [9, 19],
  // possibility arm
  [10, 11], [11, 12], [11, 13],
  // desire arm
  [14, 15], [15, 16], [16, 17], [16, 18],
];

const COLOR: Record<Arm, string> = {
  core: CORE,
  desire: DESIRE,
  possibility: POSSIBILITY,
  hinge: HABIT,
};

/** Centre the molecule on its hinge and scale it to the unit ball. */
const HINGE = ATOMS[9].p;
const NORMALIZED = ATOMS.map((a) => ({
  ...a,
  p: a.p.map((v, i) => v - HINGE[i]) as [number, number, number, number],
}));
const SCALE = 1 / Math.max(...NORMALIZED.map((a) => Math.hypot(...a.p)));

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const ease = (t: number, t0: number, t1: number, v0: number, v1: number) =>
  v0 + (v1 - v0) * smoothstep((t - t0) / (t1 - t0));

/** The slow drift the whole molecule traces through the hero, as a loop. */
function drift(t: number, narrow: boolean) {
  const k = narrow ? 0.58 : 1;
  const path = [
    { t: 0, x: 0, y: 0, r: -8 },
    { t: 0.28, x: -120 * k, y: -100 * k, r: -27 },
    { t: 0.48, x: -66 * k, y: -118 * k, r: 11 },
    { t: 0.68, x: 38 * k, y: -65 * k, r: 29 },
    { t: 0.84, x: 13 * k, y: -22 * k, r: 9 },
    { t: 1, x: 0, y: 0, r: -8 },
  ];
  const i = path.findIndex((p) => t <= p.t);
  const to = path[Math.max(1, i)];
  const from = path[Math.max(0, i - 1)];
  return {
    x: ease(t, from.t, to.t, from.x, to.x),
    y: ease(t, from.t, to.t, from.y, to.y),
    rotation: ease(t, from.t, to.t, from.r, to.r),
  };
}

/** Heteroatom glyphs. Stated, not explained. */
const GLYPH: Record<number, string> = {
  6: 'N', // indole nitrogen
  10: 'O',
  11: 'P',
  12: 'O',
  13: 'O',
  16: 'N', // the amine
};

export default function Spheroid() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let width = 0;
    let height = 0;
    let px = 0;
    let py = 0;
    let cx = 0;
    let cy = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      px = ((e.clientX - rect.left) / rect.width - 0.5) * 0.7;
      py = ((e.clientY - rect.top) / rect.height - 0.5) * 0.7;
    };

    const onPointerLeave = () => {
      px = 0;
      py = 0;
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const midX = width / 2;
      const midY = height / 2;
      const radius = Math.min(width, height) * 0.44;
      const spin = time * 0.00028;

      cx += (px - cx) * 0.055;
      cy += (py - cy) * 0.055;

      // Aura — rose bleeding into saffron, the two forces as light. Kept faint:
      // it should sit behind the structure, never wash it out.
      const aura = ctx.createRadialGradient(midX, midY, 2, midX, midY, radius * 1.35);
      aura.addColorStop(0, 'rgba(7,143,154,.10)');
      aura.addColorStop(0.45, 'rgba(168,59,91,.05)');
      aura.addColorStop(0.75, 'rgba(217,101,18,.04)');
      aura.addColorStop(1, 'rgba(232,221,197,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(midX, midY, radius * 1.35, 0, TAU);
      ctx.fill();

      // Rotate through the (x,w) and (y,z) planes, then project 4D -> 3D -> 2D.
      // The (x,w) rotation is the one that swings the arms through each other:
      // it mixes the dimension the forces are separated in.
      const a = spin * 1.7 + cx;
      const b = spin * -1.15 + cy;
      const c = spin * 0.45;

      const projected = NORMALIZED.map((atom, i) => {
        let [x, y, z, w] = atom.p.map((v) => v * SCALE);

        const xr = x * Math.cos(a) - w * Math.sin(a);
        w = x * Math.sin(a) + w * Math.cos(a);
        x = xr;

        const yr = y * Math.cos(b) - z * Math.sin(b);
        z = y * Math.sin(b) + z * Math.cos(b);
        y = yr;

        const xr2 = x * Math.cos(c) - y * Math.sin(c);
        y = x * Math.sin(c) + y * Math.cos(c);
        x = xr2;

        const k4 = 1.55 / (2.35 - w); // 4D -> 3D
        x *= k4;
        y *= k4;
        const depth = 1.7 / (2.55 - z * k4); // 3D -> 2D

        return {
          x: midX + x * radius * depth,
          y: midY + y * radius * depth,
          depth,
          color: COLOR[atom.arm],
          arm: atom.arm,
          heavy: !!atom.heavy,
          glyph: GLYPH[i],
        };
      });

      // Bonds. Drawn as a gradient between the two atoms they join, so the
      // hinge's bonds visibly grade from cyan out into rose and saffron.
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap = 'round';
      BONDS.forEach(([i, j]) => {
        const from = projected[i];
        const to = projected[j];
        const depth = (from.depth + to.depth) / 2;

        const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        grad.addColorStop(0, from.color);
        grad.addColorStop(1, to.color);

        ctx.strokeStyle = grad;
        ctx.globalAlpha = Math.min(0.9, 0.42 + depth * 0.34);
        ctx.lineWidth = Math.max(1.3, depth * 2.3);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });

      // Atoms, painter's algorithm — far ones first.
      ctx.globalCompositeOperation = 'source-over';
      projected
        .slice()
        .sort((p, q) => p.depth - q.depth)
        .forEach((p) => {
          const base = p.arm === 'hinge' ? 4.4 : p.heavy ? 3.5 : 2.7;
          const r = Math.max(1.6, base * p.depth * 0.92);

          ctx.globalAlpha = Math.min(1, 0.5 + p.depth * 0.38);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = r * 2.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();

          // The hinge gets a ring — it is the only atom that is a place.
          if (p.arm === 'hinge' && p.heavy) {
            ctx.globalAlpha = Math.min(0.8, 0.3 + p.depth * 0.3);
            ctx.strokeStyle = HABIT;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 3.4, 0, TAU);
            ctx.stroke();
          }
        });

      // Heteroatom glyphs — only on atoms facing us, so they never crowd. Said
      // plainly, and left at that.
      ctx.shadowBlur = 0;
      ctx.font = '700 9px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      projected.forEach((p) => {
        if (!p.glyph || p.depth < 0.66) return;
        ctx.globalAlpha = Math.min(0.95, (p.depth - 0.66) * 2.6);
        ctx.fillStyle = p.color;
        ctx.fillText(p.glyph, p.x, p.y - 8);
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (reduceMotion.matches) return; // one static frame, then rest

      const d = drift((time % 11000) / 11000, globalThis.innerWidth < 580);
      host.style.transform = `translate(${d.x}px, ${d.y}px) rotate(${d.rotation}deg)`;
      frame = globalThis.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    resize();
    render(0);

    return () => {
      globalThis.cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  // The sigil is NOT rendered here — it is anchored to the page in the hero, so
  // that the molecule drifts beneath a mark that never moves.
  return (
    <div class="quaternary-spheroid" ref={hostRef} aria-hidden="true">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
