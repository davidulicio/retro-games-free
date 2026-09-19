/*
 * cover.js
 * Draws original placeholder cover art for library entries that ship without
 * a screenshot. The output is abstract geometry derived from the game's slug:
 * deterministic, so a given game always gets the same art, and entirely
 * generated, so no third-party imagery is involved.
 */

import { SYSTEMS } from './systems.js';

/* Small deterministic PRNG (mulberry32) seeded from the slug. */
function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function mix(a, b, t) {
  return `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(a.g + (b.g - a.g) * t)},${Math.round(a.b + (b.b - a.b) * t)})`;
}

/**
 * Render abstract art into a canvas.
 * A coarse pixel grid with a drifting diagonal wave, tinted by the console's
 * accent colour, plus a few solid blocks for structure.
 */
export function paintCover(canvas, slug, systemKey) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const COLS = 16;
  const ROWS = 12;
  const CELL = 16;
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const rand = rng(seedFrom(slug || 'arcade'));
  const accent = hexToRgb(SYSTEMS[systemKey]?.accent || '#4fd1b0');
  const deep = hexToRgb('#0b0d13');
  const lift = hexToRgb('#1b2030');

  ctx.fillStyle = '#080a0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const phase = rand() * Math.PI * 2;
  const freq = 0.28 + rand() * 0.5;
  const skew = rand() * 0.7 - 0.35;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const wave = Math.sin((x * freq) + (y * skew) + phase);
      const depth = (wave + 1) / 2;
      const noise = rand() * 0.22;
      const t = Math.min(1, Math.max(0, depth * 0.72 + noise));
      const base = t > 0.62 ? mix(lift, accent, (t - 0.62) / 0.38) : mix(deep, lift, t / 0.62);
      ctx.fillStyle = base;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  /* A couple of solid bars to give the composition an anchor. */
  const bars = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < bars; i++) {
    const bx = Math.floor(rand() * (COLS - 4));
    const by = Math.floor(rand() * (ROWS - 2));
    const bw = 2 + Math.floor(rand() * 4);
    const bh = 1 + Math.floor(rand() * 2);
    ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${0.55 + rand() * 0.35})`;
    ctx.fillRect(bx * CELL, by * CELL, bw * CELL, bh * CELL);
  }

  /* Vignette so the card edges settle into the page. */
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, 'rgba(0,0,0,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
