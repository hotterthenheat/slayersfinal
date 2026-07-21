import { useEffect, useRef } from 'react';

/*
  Hero backdrop — a faithful rebuild of slayerterminal.com's actual hero:
  a fine dot-matrix over pure black. Not a 3D surface. The grid sits dim and
  even; the cursor is the light source — dots inside its radius warm to
  holographic silver and swell, and a soft glow trails the pointer. With no
  pointer (touch / idle) a slow phantom light drifts a Lissajous path so the
  field never dies. Reduced-motion pins the phantom and drops the ambient
  shimmer. Canvas 2D — a few kB of runtime, no WebGL, no external scene.
*/

interface DotFieldProps {
  /** Grid pitch in CSS px. */
  gap?: number;
  /** Radius of the cursor's influence, CSS px. */
  reach?: number;
  className?: string;
  height?: number | string;
}

// Holo-silver highlight (matches the app's holo system + the real site's sheen)
const HL = { r: 199, g: 211, b: 232 };

const DotField = ({ gap = 26, reach = 190, className = '', height = '100%' }: DotFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // eased pointer + a phantom light for when there's no pointer
    let px = -9999;
    let py = -9999; // raw target (or -9999 when absent)
    let ex = 0;
    let ey = 0; // eased position actually drawn
    let hasPointer = false;
    let t = 0;

    const parent = canvas.parentElement;

    const resize = () => {
      const rect = parent?.getBoundingClientRect();
      w = rect?.width ?? canvas.clientWidth;
      h = rect?.height ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!hasPointer) {
        ex = w * 0.5;
        ey = h * 0.42;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);

    // pointer tracking on the window so the glow reacts even over the copy
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= -reach && x <= w + reach && y >= -reach && y <= h + reach) {
        px = x;
        py = y;
        hasPointer = true;
      } else {
        hasPointer = false;
      }
    };
    const onLeave = () => {
      hasPointer = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);

    const reach2 = reach * reach;

    const frame = () => {
      t += 1;

      // Phantom light: a slow Lissajous drift when no real pointer is present.
      if (hasPointer) {
        ex += (px - ex) * 0.12;
        ey += (py - ey) * 0.12;
      } else if (!reduce) {
        const a = t * 0.006;
        const gx = w * (0.5 + 0.32 * Math.cos(a));
        const gy = h * (0.44 + 0.26 * Math.sin(a * 1.31));
        ex += (gx - ex) * 0.05;
        ey += (gy - ey) * 0.05;
      }

      ctx.clearRect(0, 0, w, h);

      // Soft glow blob under the light
      const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, reach * 1.15);
      glow.addColorStop(0, `rgba(${HL.r},${HL.g},${HL.b},0.10)`);
      glow.addColorStop(0.5, `rgba(${HL.r},${HL.g},${HL.b},0.03)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Dot matrix
      const cols = Math.ceil(w / gap) + 1;
      const rows = Math.ceil(h / gap) + 1;
      const wave = reduce ? 0 : 0.5 + 0.5 * Math.sin(t * 0.02);
      for (let i = 0; i < cols; i++) {
        const x = i * gap;
        for (let j = 0; j < rows; j++) {
          const y = j * gap;
          const dx = x - ex;
          const dy = y - ey;
          const d2 = dx * dx + dy * dy;

          // base dim grid + a faint diagonal ambient shimmer
          const amb = reduce ? 0 : 0.02 * Math.max(0, Math.sin((x + y) * 0.012 - t * 0.03)) * wave;
          let a = 0.05 + amb;
          let rad = 0.9;

          if (d2 < reach2) {
            const f = 1 - Math.sqrt(d2) / reach; // 0..1 falloff
            const e = f * f; // ease the ramp
            a += e * 0.85;
            rad += e * 1.7;
          }

          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${HL.r},${HL.g},${HL.b},${a > 0.95 ? 0.95 : a})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(frame);
    };
    let raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [gap, reach]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height }}
      aria-hidden
    />
  );
};

export default DotField;
