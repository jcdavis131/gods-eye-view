"use client";
// Procedurally drawn HUD glyphs for billboards. Everything is generated on a
// canvas at runtime so the app ships no binary sprite assets. Cached by key.

export type IconKind =
  | "plane"
  | "heli"
  | "ship"
  | "sat"
  | "cam"
  | "pad"
  | "rocket"
  | "quake"
  | "car"
  | "dot"
  | "gauge"
  | "well"
  | "dam"
  | "chip";

const cache = new Map<string, HTMLCanvasElement>();

export function iconKey(kind: IconKind, color: string, size = 32): string {
  return `${kind}:${color}:${size}`;
}

export function getIcon(kind: IconKind, color: string, size = 32): HTMLCanvasElement {
  const key = iconKey(kind, color, size);
  let c = cache.get(key);
  if (!c) {
    c = draw(kind, color, size);
    cache.set(key, c);
  }
  return c;
}

function draw(kind: IconKind, color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size / 32; // all paths are authored in a 32x32 box
  ctx.scale(s, s);
  ctx.translate(16, 16);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  const path = new Path2D();
  switch (kind) {
    case "plane": {
      // nose up (north)
      path.moveTo(0, -13);
      path.lineTo(2.2, -8);
      path.lineTo(2.4, -3);
      path.lineTo(13, 3);
      path.lineTo(13, 5.5);
      path.lineTo(2.4, 2.5);
      path.lineTo(1.8, 8.5);
      path.lineTo(5.5, 11);
      path.lineTo(5.5, 12.5);
      path.lineTo(0, 11);
      path.lineTo(-5.5, 12.5);
      path.lineTo(-5.5, 11);
      path.lineTo(-1.8, 8.5);
      path.lineTo(-2.4, 2.5);
      path.lineTo(-13, 5.5);
      path.lineTo(-13, 3);
      path.lineTo(-2.4, -3);
      path.lineTo(-2.2, -8);
      path.closePath();
      break;
    }
    case "heli": {
      path.moveTo(0, -9);
      path.lineTo(4, -4);
      path.lineTo(4, 4);
      path.lineTo(1.5, 8);
      path.lineTo(1.5, 12);
      path.lineTo(-1.5, 12);
      path.lineTo(-1.5, 8);
      path.lineTo(-4, 4);
      path.lineTo(-4, -4);
      path.closePath();
      break;
    }
    case "ship": {
      path.moveTo(0, -12);
      path.lineTo(5, -3);
      path.lineTo(5, 10);
      path.lineTo(-5, 10);
      path.lineTo(-5, -3);
      path.closePath();
      break;
    }
    case "car": {
      path.moveTo(0, -6);
      path.lineTo(3.5, -2);
      path.lineTo(3.5, 6);
      path.lineTo(-3.5, 6);
      path.lineTo(-3.5, -2);
      path.closePath();
      break;
    }
    case "sat": {
      // body + two solar panels
      path.rect(-3, -3, 6, 6);
      path.rect(-14, -2, 8, 4);
      path.rect(6, -2, 8, 4);
      break;
    }
    case "cam": {
      // camera body with lens, looking right-ish
      path.moveTo(-11, -6);
      path.lineTo(5, -6);
      path.lineTo(5, -2);
      path.lineTo(12, -6);
      path.lineTo(12, 6);
      path.lineTo(5, 2);
      path.lineTo(5, 6);
      path.lineTo(-11, 6);
      path.closePath();
      break;
    }
    case "pad": {
      // launch pad: base + gantry
      path.rect(-10, 8, 20, 4);
      path.rect(-2, -12, 4, 20);
      path.rect(4, -8, 3, 16);
      break;
    }
    case "rocket": {
      path.moveTo(0, -14);
      path.lineTo(4, -6);
      path.lineTo(4, 8);
      path.lineTo(8, 13);
      path.lineTo(2, 11);
      path.lineTo(0, 14);
      path.lineTo(-2, 11);
      path.lineTo(-8, 13);
      path.lineTo(-4, 8);
      path.lineTo(-4, -6);
      path.closePath();
      break;
    }
    case "quake": {
      path.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke(path);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.stroke(path);
      const inner = new Path2D();
      inner.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill(inner);
      return canvas;
    }
    case "gauge": {
      // water drop: a stream / reservoir gauge
      path.moveTo(0, -13);
      path.bezierCurveTo(6, -4, 10, 2, 10, 6);
      path.arc(0, 6, 10, 0, Math.PI, false);
      path.bezierCurveTo(-10, 2, -6, -4, 0, -13);
      path.closePath();
      break;
    }
    case "well": {
      // groundwater well: casing ring over a shaft
      path.rect(-2, -4, 4, 16);
      path.moveTo(9, -8);
      path.arc(0, -8, 9, 0, Math.PI * 2);
      break;
    }
    case "dam": {
      // dam wall: wide trapezoid with a crest
      path.moveTo(-12, 10);
      path.lineTo(-5, -10);
      path.lineTo(5, -10);
      path.lineTo(12, 10);
      path.closePath();
      path.rect(-7, -13, 14, 3);
      break;
    }
    case "chip": {
      // turbidity chip: a square swatch
      path.rect(-9, -9, 18, 18);
      break;
    }
    case "dot":
    default: {
      path.arc(0, 0, 5, 0, Math.PI * 2);
      break;
    }
  }
  ctx.stroke(path);
  ctx.fill(path);
  return canvas;
}

/** A soft radial glow used behind selected objects. */
export function getGlow(color: string, size = 64): HTMLCanvasElement {
  const key = `glow:${color}:${size}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + "80");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}
