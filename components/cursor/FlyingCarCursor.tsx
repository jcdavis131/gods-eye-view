"use client";

import { useEffect, useRef, useState } from "react";

/**
 * FlyingCarCursor — replaces the native pointer with a sleek low-slung
 * flying car (Gigacity-style: charcoal body, red taillights, bright
 * thruster exhaust, cyan underglow). The car chases the pointer with
 * trailing physics, banks into turns, lays an exhaust trail, boosts on
 * click, and shows a target-lock ring over interactive elements.
 *
 * Mounts only on fine-pointer devices without prefers-reduced-motion.
 * Text fields and selects keep their native cursor for usability.
 */
const CAR_W = 132;
const CAR_H = 88;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
};

export function FlyingCarCursor() {
  const [enabled, setEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const carRef = useRef<HTMLDivElement | null>(null);
  const flameRef = useRef<SVGGElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fine && !calm) setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    const car = carRef.current;
    const flame = flameRef.current;
    const ring = ringRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !car || !canvas || !ctx) return;

    document.documentElement.classList.add("flying-car-cursor");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCanvas = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    };
    sizeCanvas();

    let raf = 0;
    let last = performance.now();
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let px = tx;
    let py = ty;
    let angle = 0;
    let bank = 0;
    let visible = false;
    let inField = false;
    let hovering = false;
    let boostUntil = 0;
    let spawnAcc = 0;
    const parts: Particle[] = [];

    const show = () => {
      visible = true;
      root.style.opacity = "1";
    };
    const hide = () => {
      visible = false;
      root.style.opacity = "0";
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const t = e.target as HTMLElement | null;
      inField = !!t?.closest?.(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
      );
      hovering =
        !inField &&
        !!t?.closest?.(
          'a,button,[role="button"],summary,label,[data-fcc-hover]',
        );
      if (inField) {
        hide();
      } else if (!visible) {
        show();
      }
      if (ring) {
        ring.style.opacity = hovering ? "1" : "0";
        ring.classList.toggle("on", hovering);
      }
    };
    const onDown = () => {
      boostUntil = performance.now() + 350;
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) hide();
    };
    const onBlur = () => hide();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", sizeCanvas);
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onBlur);

    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, v));

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Chase the pointer with trailing physics.
      const k = 1 - Math.pow(0.0001, dt);
      const nx = px + (tx - px) * k;
      const ny = py + (ty - py) * k;
      const vx = (nx - px) / Math.max(dt, 1e-4);
      const vy = (ny - py) / Math.max(dt, 1e-4);
      px = nx;
      py = ny;
      const speed = Math.hypot(vx, vy);

      // Heading + banking into turns.
      if (speed > 40) {
        const target = Math.atan2(vy, vx);
        let d = target - angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        angle += d * (1 - Math.pow(0.001, dt));
        const turn = clamp(d / Math.max(dt, 1e-4), -4, 4);
        bank += (turn * 0.18 - bank) * (1 - Math.pow(0.01, dt));
      }

      // Gentle hover bob, perpendicular to heading.
      const bob = Math.sin(now / 240) * 2.2;
      const bobX = Math.cos(angle + Math.PI / 2) * bob;
      const bobY = Math.sin(angle + Math.PI / 2) * bob;

      const boosting = now < boostUntil;
      const scale = boosting ? 1.08 : 1;
      const bankSquash = 1 - Math.min(Math.abs(bank) * 0.12, 0.18);

      car.style.transform =
        `translate3d(${px + bobX - CAR_W / 2}px,${py + bobY - CAR_H / 2}px,0) ` +
        `rotate(${angle + bank * 0.12}rad) scale(${scale},${scale * bankSquash})`;

      // Thruster flame: grows with speed, flickers, flares on boost.
      if (flame) {
        const base = 0.45 + Math.min(speed / 900, 1.1);
        const flicker =
          1 + 0.16 * Math.sin(now / 31) + 0.09 * Math.sin(now / 17 + 1.3);
        const s = base * flicker * (boosting ? 1.7 : 1);
        flame.setAttribute(
          "transform",
          `translate(12 44) scale(${s.toFixed(3)} 1) translate(-12 -44)`,
        );
      }

      // Exhaust trail particles.
      if (speed > 60 && visible && !inField) {
        spawnAcc += dt * clamp(speed / 40, 0, 22);
        const rx = px - Math.cos(angle) * (CAR_W * 0.34);
        const ry = py - Math.sin(angle) * (CAR_W * 0.34);
        while (spawnAcc >= 1 && parts.length < 240) {
          spawnAcc -= 1;
          const j = () => (Math.random() - 0.5) * 40;
          parts.push({
            x: rx + j() * 0.2,
            y: ry + j() * 0.2,
            vx: -Math.cos(angle) * (50 + speed * 0.12) + j(),
            vy: -Math.sin(angle) * (50 + speed * 0.12) + j(),
            life: 0,
            max: 0.5 + Math.random() * 0.4,
            size: 2 + Math.random() * 3,
          });
        }
      } else {
        spawnAcc = 0;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (parts.length > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life += dt;
          if (p.life >= p.max) {
            parts.splice(i, 1);
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.97;
          p.vy *= 0.97;
          const t = 1 - p.life / p.max;
          const r = p.size * (0.5 + t * 0.8);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
          g.addColorStop(0, `rgba(140,240,255,${(0.5 * t).toFixed(3)})`);
          g.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      void hovering;
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", sizeCanvas);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onBlur);
      document.documentElement.classList.remove("flying-car-cursor");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={rootRef} aria-hidden="true" className="fcc-root">
      <canvas ref={canvasRef} className="fcc-trail" />
      <div ref={carRef} className="fcc-car">
        <svg
          width={CAR_W}
          height={CAR_H}
          viewBox="0 0 132 88"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="fcc-body"
              x1="10"
              y1="28"
              x2="122"
              y2="60"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#39424e" />
              <stop offset="0.45" stopColor="#161b22" />
              <stop offset="1" stopColor="#05070a" />
            </linearGradient>
            <linearGradient
              id="fcc-canopy"
              x1="80"
              y1="36"
              x2="106"
              y2="46"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#67e8f9" />
              <stop offset="0.5" stopColor="#0e7490" />
              <stop offset="1" stopColor="#083344" />
            </linearGradient>
            <linearGradient
              id="fcc-flame"
              x1="12"
              y1="0"
              x2="-46"
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#e0faff" />
              <stop offset="0.35" stopColor="#67e8f9" />
              <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
            <filter id="fcc-blur6" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="fcc-blur10" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          {/* cyan underglow */}
          <ellipse
            cx="66"
            cy="70"
            rx="46"
            ry="9"
            fill="#22d3ee"
            opacity="0.28"
            filter="url(#fcc-blur10)"
          />

          {/* target-lock ring over interactive elements */}
          <circle
            ref={ringRef}
            className="fcc-ring"
            cx="66"
            cy="44"
            r="54"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="6 10"
            opacity="0"
          />

          {/* thruster exhaust (scaled per-frame by speed) */}
          <g ref={flameRef}>
            <path
              d="M12 44 C -4 40.5, -22 40, -46 44 C -22 48, -4 47.5, 12 44 Z"
              fill="url(#fcc-flame)"
              opacity="0.85"
            />
            <path
              d="M12 44 C 2 42.8, -8 42.8, -22 44 C -8 45.2, 2 45.2, 12 44 Z"
              fill="#f0fdff"
              opacity="0.95"
            />
          </g>

          {/* swept wing fins */}
          <path
            d="M34 33 L16 24 L24 37 Z"
            fill="#1f2937"
            stroke="#67e8f9"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          <path
            d="M34 55 L16 64 L24 51 Z"
            fill="#1f2937"
            stroke="#67e8f9"
            strokeOpacity="0.5"
            strokeWidth="1"
          />

          {/* sleek low-slung body */}
          <path
            d="M122 44 C112 34 96 30 76 30 C52 30 30 36 16 42 C10 44.5 10 47.5 16 49.5 C34 55 56 58 78 57 C98 56 114 51 122 44 Z"
            fill="url(#fcc-body)"
            stroke="#0b0e13"
            strokeWidth="1"
          />
          {/* top highlight */}
          <path
            d="M116 41 C104 33 90 31 74 31"
            stroke="#a5f3fc"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* side intake line */}
          <path
            d="M96 52 C78 55 58 54 40 50"
            stroke="#67e8f9"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* canopy */}
          <path
            d="M106 44 C102 37.5 94 35.5 85 36.5 C92 40 99 42.5 106 44 Z"
            fill="url(#fcc-canopy)"
          />
          <path
            d="M102 41.5 C98 39 93 38 88 38.2"
            stroke="#ffffff"
            strokeOpacity="0.7"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* red taillights */}
          <path
            d="M13 40 Q8 44 13 48"
            stroke="#ff2d40"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#fcc-blur6)"
            opacity="0.9"
          />
          <path
            d="M13 40 Q8 44 13 48"
            stroke="#ff8a95"
            strokeWidth="1.4"
            strokeLinecap="round"
          />

          {/* nose light */}
          <circle cx="119" cy="44" r="2.2" fill="#e0faff" />
          <circle
            cx="119"
            cy="44"
            r="5"
            fill="#a5f3fc"
            opacity="0.5"
            filter="url(#fcc-blur6)"
          />
        </svg>
      </div>
    </div>
  );
}
