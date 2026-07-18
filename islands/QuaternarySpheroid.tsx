import { useEffect, useRef } from 'preact/hooks';

type Point4 = [number, number, number, number];

const TAU = Math.PI * 2;
const PALETTE = ['#a83b5b', '#4d4b8b', '#188a82', '#c17b22'];

function makeSphere(count: number): Point4[] {
  const phi = 0.618033988749895;
  const psi = 0.414213562373095;

  return Array.from({ length: count }, (_, index) => {
    const u = (index + 0.5) / count;
    const a = TAU * ((index * phi) % 1);
    const b = TAU * ((index * psi) % 1);
    const inner = Math.sqrt(u);
    const outer = Math.sqrt(1 - u);
    return [
      inner * Math.cos(a),
      inner * Math.sin(a),
      outer * Math.cos(b),
      outer * Math.sin(b),
    ];
  });
}

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

function between(
  progress: number,
  start: number,
  end: number,
  from: number,
  to: number,
) {
  return from + (to - from) * ease((progress - start) / (end - start));
}

function flight(progress: number, compact: boolean) {
  const scale = compact ? 0.58 : 1;
  const stops = [
    { t: 0, x: 0, y: 0, r: -8 },
    { t: 0.28, x: -120 * scale, y: -100 * scale, r: -27 },
    { t: 0.48, x: -66 * scale, y: -118 * scale, r: 11 },
    { t: 0.68, x: 38 * scale, y: -65 * scale, r: 29 },
    { t: 0.84, x: 13 * scale, y: -22 * scale, r: 9 },
    { t: 1, x: 0, y: 0, r: -8 },
  ];

  const endIndex = stops.findIndex((stop) => progress <= stop.t);
  const to = stops[Math.max(1, endIndex)];
  const from = stops[Math.max(0, endIndex - 1)];

  return {
    x: between(progress, from.t, to.t, from.x, to.x),
    y: between(progress, from.t, to.t, from.y, to.y),
    rotation: between(progress, from.t, to.t, from.r, to.r),
  };
}

export default function QuaternarySpheroid() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const points = makeSphere(128);
    const reducedMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const move = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.7;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 0.7;
    };

    const leave = () => {
      targetX = 0;
      targetY = 0;
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.34;
      const phase = time * 0.00028;
      pointerX += (targetX - pointerX) * 0.055;
      pointerY += (targetY - pointerY) * 0.055;

      const aura = context.createRadialGradient(cx, cy, 2, cx, cy, radius * 1.55);
      aura.addColorStop(0, 'rgba(7,143,154,.19)');
      aura.addColorStop(0.45, 'rgba(168,59,91,.09)');
      aura.addColorStop(1, 'rgba(232,221,197,0)');
      context.fillStyle = aura;
      context.beginPath();
      context.arc(cx, cy, radius * 1.55, 0, TAU);
      context.fill();

      context.save();
      context.translate(cx, cy);
      context.globalCompositeOperation = 'multiply';
      PALETTE.forEach((color, index) => {
        context.save();
        context.rotate(phase * (index % 2 ? -1.25 : 1) + index * Math.PI / 4);
        context.scale(1, 0.33 + index * 0.035);
        context.strokeStyle = color;
        context.globalAlpha = 0.52;
        context.lineWidth = index === 3 ? 1.5 : 1;
        context.shadowColor = color;
        context.shadowBlur = 9;
        context.beginPath();
        context.arc(0, 0, radius * (0.78 + index * 0.12), 0, TAU);
        context.stroke();
        context.restore();
      });
      context.restore();

      const projected = points.map(([x0, y0, z0, w0], index) => {
        const xw = phase * 1.7 + pointerX;
        const yz = phase * -1.15 + pointerY;
        const xy = phase * 0.45;

        let x = x0 * Math.cos(xw) - w0 * Math.sin(xw);
        const w = x0 * Math.sin(xw) + w0 * Math.cos(xw);
        let y = y0 * Math.cos(yz) - z0 * Math.sin(yz);
        let z = y0 * Math.sin(yz) + z0 * Math.cos(yz);
        const rotatedX = x * Math.cos(xy) - y * Math.sin(xy);
        y = x * Math.sin(xy) + y * Math.cos(xy);
        x = rotatedX;

        const fourPerspective = 1.55 / (2.35 - w);
        x *= fourPerspective;
        y *= fourPerspective;
        z *= fourPerspective;
        const threePerspective = 1.7 / (2.55 - z);

        return {
          x: cx + x * radius * threePerspective,
          y: cy + y * radius * threePerspective,
          depth: threePerspective,
          color: PALETTE[index % PALETTE.length],
        };
      });

      context.globalCompositeOperation = 'multiply';
      context.lineWidth = 0.45;
      context.globalAlpha = 0.14;
      for (let index = 0; index < projected.length; index += 4) {
        const point = projected[index];
        const next = projected[(index + 17) % projected.length];
        context.strokeStyle = point.color;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(next.x, next.y);
        context.stroke();
      }

      context.globalCompositeOperation = 'source-over';
      projected
        .sort((a, b) => a.depth - b.depth)
        .forEach((point) => {
          const size = Math.max(0.75, point.depth * 1.45);
          context.globalAlpha = Math.min(0.92, 0.26 + point.depth * 0.32);
          context.fillStyle = point.color;
          context.shadowColor = point.color;
          context.shadowBlur = size * 3.5;
          context.beginPath();
          context.arc(point.x, point.y, size, 0, TAU);
          context.fill();
        });

      context.shadowBlur = 13;
      context.globalAlpha = 0.92;
      context.fillStyle = '#66733d';
      context.beginPath();
      context.arc(cx, cy, 3.2 + Math.sin(phase * 6) * 0.8, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
      context.shadowBlur = 0;

      if (!reducedMotion.matches) {
        const position = flight((time % 11000) / 11000, globalThis.innerWidth < 580);
        stage.style.transform =
          `translate(${position.x}px, ${position.y}px) rotate(${position.rotation}deg)`;
        animationFrame = globalThis.requestAnimationFrame(draw);
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', leave);
    resize();
    draw(0);

    return () => {
      globalThis.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div class='quaternary-spheroid' ref={stageRef} aria-hidden='true'>
      <canvas ref={canvasRef} />
      <span class='spheroid-sigil'>IV</span>
    </div>
  );
}
