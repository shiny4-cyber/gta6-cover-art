// The cover art engine. One scene object goes in, a finished poster comes out, at any pixel size:
// every shape, gradient, figure crop and letterform is drawn here, so the same scene renders a
// 320 px preview and a 1600 px export.
//
// Composition, back to front: sky gradient and sun, a procedurally built skyline, palm
// silhouettes, a run of angled photo panels, print texture (halftone dots and grain), the title
// band with the caption lettered in a skewed, stroked block, and a thin frame.

import { drawPanelPhoto } from './photo.js';

export const PALETTES = {
  sunset: {
    label: 'Sunset',
    tag: 'SUNSET STRIP',
    sky: ['#2b0736', '#5a0d55', '#a3185f', '#e0433c', '#ff8a3a', '#ffc46b'],
    ink: '#150617',
    accent: '#ffd166',
    sun: '#ffe6b8',
    glow: 'rgba(255,138,58,0.60)',
    title: ['#fff8ec', '#ffcf94'],
    titleInk: '#180616',
    grade: { shadow: '#2a0f3a', mid: '#c2415c', high: '#ffe2b4', contrast: 1.22, mix: 0.5, sat: 1.0, tint: [1.05, 0.985, 0.93] },
  },
  night: {
    label: 'Night neon',
    tag: 'NEON NIGHT',
    sky: ['#04061a', '#0a1240', '#231566', '#611a86', '#c01f7e', '#ff3d7f'],
    ink: '#03030c',
    accent: '#3ff0ff',
    sun: '#ffd9f2',
    glow: 'rgba(255,61,127,0.55)',
    title: ['#f2fdff', '#8fe6ff'],
    titleInk: '#040616',
    grade: { shadow: '#070e2c', mid: '#5b3fb4', high: '#cdefff', contrast: 1.24, mix: 0.52, sat: 0.95, tint: [0.97, 0.99, 1.08] },
  },
  day: {
    label: 'Daylight',
    tag: 'DAYLIGHT',
    sky: ['#0f3b6d', '#2c7fb4', '#71c3d6', '#ffd6a2', '#fff0d2', '#fffaf0'],
    ink: '#0b2237',
    accent: '#ff8f4d',
    sun: '#fffdf4',
    glow: 'rgba(255,214,160,0.55)',
    title: ['#ffffff', '#ffe6bd'],
    titleInk: '#0a1b2b',
    grade: { shadow: '#143954', mid: '#7fb2c6', high: '#fff6de', contrast: 1.12, mix: 0.3, sat: 1.0, tint: [1.03, 1.0, 0.96] },
  },
};

export const LAYOUTS = [
  { id: 'triptych', label: 'Three panels', count: 3 },
  { id: 'quad', label: 'Four panels', count: 4 },
  { id: 'six', label: 'Six panels', count: 6 },
  { id: 'duo', label: 'Two panels', count: 2 },
];

const DEG = Math.PI / 180;

/** A small deterministic random generator, so grain, windows and stars never flicker on redraw. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Panel rectangles for a cover of w x h: each {index, cx, cy, pw, ph, rot, skew, z}, plus the
 * baseline every panel stands on and the title band that starts there.
 */
export function layoutScene(w, h, layoutId) {
  const wide = w / h > 1.12;
  const bandH = h * (wide ? 0.245 : 0.205);
  const base = h - bandH;
  const top = h * (wide ? 0.125 : 0.095);
  const pad = w * (wide ? 0.032 : 0.042);
  const boxW = w - pad * 2;
  const boxH = base - top;
  const cols = [];

  if (layoutId === 'quad') {
    const cw = boxW * 0.475;
    const rh = boxH * 0.485;
    for (let i = 0; i < 4; i += 1) {
      const left = i % 2 === 0;
      const up = i < 2;
      cols.push({
        cx: left ? pad + cw / 2 : w - pad - cw / 2,
        cy: up ? top + rh / 2 : base - rh / 2,
        pw: cw,
        ph: rh * (up ? 1 : 0.94),
        rot: [-1.3, 1.1, -1.5, 0.9][i] * DEG,
        skew: [0.018, -0.016, -0.014, 0.02][i],
      });
    }
  } else if (layoutId === 'six') {
    const cw = boxW * 0.315;
    const rh = boxH * 0.487;
    for (let i = 0; i < 6; i += 1) {
      const col = i % 3;
      const up = i < 3;
      cols.push({
        cx: pad + cw / 2 + col * (boxW - cw) / 2,
        cy: up ? top + rh / 2 : base - rh / 2,
        pw: cw,
        ph: rh * (up ? 1 : 0.93),
        rot: [-1.4, 0.5, 1.3, 1.0, -0.6, -1.2][i] * DEG,
        skew: [0.02, 0, -0.02, -0.018, 0.004, 0.016][i],
      });
    }
  } else if (layoutId === 'duo') {
    const cw = boxW * 0.47;
    cols.push({ cx: pad + cw / 2, cy: top + (boxH * 0.93) / 2, pw: cw, ph: boxH * 0.93, rot: -1.1 * DEG, skew: 0.02 });
    cols.push({ cx: w - pad - cw / 2, cy: base - (boxH * 0.95) / 2, pw: cw, ph: boxH * 0.95, rot: 1.05 * DEG, skew: -0.02 });
  } else {
    const sideW = boxW * (wide ? 0.285 : 0.3);
    const midW = boxW * (wide ? 0.32 : 0.325);
    const sideH = boxH * (wide ? 0.86 : 0.87);
    cols.push({ cx: pad + sideW / 2, cy: base - sideH / 2, pw: sideW, ph: sideH, rot: -1.7 * DEG, skew: 0.026, z: 1 });
    cols.push({ cx: w / 2, cy: top + boxH / 2, pw: midW, ph: boxH, rot: 0.4 * DEG, skew: 0, z: 3 });
    cols.push({ cx: w - pad - sideW / 2, cy: base - sideH / 2, pw: sideW, ph: sideH, rot: 1.6 * DEG, skew: -0.026, z: 1 });
  }

  const rects = cols.map((c, i) => ({ index: i, z: c.z ?? 2, ...c }));
  return { panels: rects, bandTop: base, bandHeight: bandH, top, wide };
}

/** Draws the whole cover: `scene` is {caption, palette, layout, panels[], fast, detail}. */
export function drawCoverArt(ctx, w, h, scene) {
  const pal = PALETTES[scene.palette] || PALETTES.sunset;
  const u = Math.min(w, h) / 1000;
  const layout = layoutScene(w, h, scene.layout);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, w, h, pal, layout);
  drawSun(ctx, w, h, pal, layout);

  const order = layout.panels.slice().sort((a, b) => a.z - b.z || a.index - b.index);
  for (const rect of order) {
    drawPanel(ctx, rect, scene.panels[rect.index], pal, u, scene.fast === true);
  }

  drawTitleBand(ctx, w, h, pal, layout, scene.caption, u);
  drawSkyline(ctx, w, h, pal, layout, u);
  drawPalms(ctx, w, h, pal, layout, u);
  drawTexture(ctx, w, h, pal, u);
  drawFrame(ctx, w, h, pal, u);
  ctx.restore();
}

function drawSky(ctx, w, h, pal, layout) {
  // The whole sunset ramp is squeezed into the strip above the panels: whatever the frame, the
  // top band reads purple, magenta, orange, and the light between the panels glows warm.
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(h * 0.08, layout.top * 0.92));
  const stops = pal.sky;
  stops.forEach((c, i) => g.addColorStop((i / (stops.length - 1)) * 0.94, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Knock the strip back a little so the panels keep the eye.
  const veil = ctx.createLinearGradient(0, 0, 0, layout.bandTop);
  veil.addColorStop(0, 'rgba(18,4,26,0.34)');
  veil.addColorStop(0.7, 'rgba(18,4,26,0.16)');
  veil.addColorStop(1, 'rgba(18,4,26,0.45)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, layout.bandTop);

  if (pal === PALETTES.night) {
    const rnd = mulberry32(7);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 110; i += 1) {
      const x = rnd() * w;
      const y = rnd() * layout.top * 0.95;
      const r = (0.4 + rnd() * 1.1) * (w / 1000);
      ctx.globalAlpha = 0.2 + rnd() * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Soft cloud bars catching the light.
  const cloud = mulberry32(19);
  for (let i = 0; i < 5; i += 1) {
    const y = layout.top * (0.25 + i * 0.16);
    const cx = w * (0.15 + cloud() * 0.7);
    const rw = w * (0.2 + cloud() * 0.3);
    const rh = h * (0.008 + cloud() * 0.012);
    const cg = ctx.createRadialGradient(cx, y, 0, cx, y, rw);
    cg.addColorStop(0, `rgba(255,240,220,${pal === PALETTES.day ? 0.34 : 0.16})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(1, rh / rw);
    ctx.beginPath();
    ctx.arc(0, 0, rw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSun(ctx, w, h, pal, layout) {
  const cx = w * 0.5;
  const cy = layout.top * 0.86;
  const r = Math.min(w, h) * (pal === PALETTES.day ? 0.085 : 0.112);

  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 4.4);
  glow.addColorStop(0, pal.glow);
  glow.addColorStop(0.55, pal.glow.replace(/[\d.]+\)$/, '0.16)'));
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, layout.bandTop);

  // The disc is built on its own canvas so its cut bands erase the sun, never the sky behind it:
  // the striped sun of every poster sunset.
  const d = Math.ceil(r * 2.2);
  const disc = document.createElement('canvas');
  disc.width = d;
  disc.height = d;
  const dg = disc.getContext('2d');
  dg.fillStyle = pal.sun;
  dg.beginPath();
  dg.arc(d / 2, d / 2, r, 0, Math.PI * 2);
  dg.fill();
  dg.globalCompositeOperation = 'destination-out';
  dg.fillStyle = '#000';
  const bands = 5;
  for (let i = 0; i < bands; i += 1) {
    const y = d / 2 + r * (0.05 + i * 0.19);
    dg.fillRect(0, y, d, r * (0.028 + i * 0.02));
  }
  ctx.drawImage(disc, cx - d / 2, cy - d / 2);
}

function drawSkyline(ctx, w, h, pal, layout, u) {
  // A low skyline standing on the title band's top edge, in front of the panels' feet: the city
  // the poster is set in, and a horizon that ties the panels to the lettering.
  const rnd = mulberry32(41);
  const base = layout.bandTop + h * 0.006;
  const tall = h * 0.075;
  let x = -w * 0.01;
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = 0.92;
  while (x < w) {
    const bw = w * (0.018 + rnd() * 0.05);
    const bh = tall * (0.22 + rnd() * 0.78);
    ctx.fillRect(x, base - bh, bw, bh + h * 0.02);
    x += bw + w * 0.003;
  }

  // A handful of lit windows, only in the taller blocks, so the band stays quiet.
  const rnd2 = mulberry32(53);
  x = 0;
  ctx.fillStyle = pal.accent;
  while (x < w) {
    const bw = w * (0.018 + rnd2() * 0.05);
    const bh = tall * (0.22 + rnd2() * 0.78);
    if (bh > tall * 0.55) {
      const cols = Math.max(1, Math.floor(bw / (10 * u)));
      const rows = Math.max(1, Math.floor(bh / (12 * u)));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (rnd2() > 0.78) {
            ctx.globalAlpha = 0.28 + rnd2() * 0.35;
            ctx.fillRect(x + 3 * u + c * 10 * u, base - bh + 4 * u + r * 12 * u, 3 * u, 4.5 * u);
          }
        }
      }
    }
    x += bw + w * 0.003;
  }
  ctx.globalAlpha = 1;

  // Haze lifting off the band edge into the panels.
  const haze = ctx.createLinearGradient(0, base - h * 0.06, 0, base);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, pal.glow);
  ctx.fillStyle = haze;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, base - h * 0.06, w, h * 0.06);
  ctx.globalAlpha = 1;
}

function drawPalms(ctx, w, h, pal, layout, u) {
  // Two palms at the outer edges, drawn in front of the panels: dark framing for the poster.
  const trees = [
    { x: 0.008, crown: 0.46, flip: false, scale: 1 },
    { x: 0.992, crown: 0.55, flip: true, scale: 0.88 },
  ];
  for (const t of trees) {
    const x0 = w * t.x;
    const base = layout.bandTop + h * 0.04;
    const top = h * t.crown;
    const x1 = x0 + (t.flip ? -1 : 1) * w * 0.028;

    ctx.save();
    ctx.strokeStyle = pal.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, 13 * u * t.scale);
    ctx.beginPath();
    ctx.moveTo(x0, base);
    ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.2, (base + top) / 2, x1, top);
    ctx.stroke();

    const fronds = 9;
    const len = Math.min(w, h) * 0.13 * t.scale;
    for (let i = 0; i < fronds; i += 1) {
      const a = (-Math.PI * 0.95) + (i / (fronds - 1)) * Math.PI * 0.9;
      const dir = t.flip ? -1 : 1;
      const ex = x1 + Math.cos(a) * len * dir;
      const ey = top + Math.sin(a) * len * 0.52 + len * 0.42;
      ctx.lineWidth = Math.max(1.5, 5.5 * u * t.scale);
      ctx.beginPath();
      ctx.moveTo(x1, top);
      ctx.quadraticCurveTo(
        x1 + Math.cos(a) * len * 0.55 * dir,
        top + Math.sin(a) * len * 0.2 - len * 0.1,
        ex,
        ey,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPanel(ctx, rect, entry, pal, u, fast) {
  const { cx, cy, pw, ph, rot, skew } = rect;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.rotate(rot);

  // Paper drop shadow, then the panel itself.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22 * u;
  ctx.shadowOffsetY = 9 * u;
  ctx.fillStyle = pal.ink;
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(-pw / 2, -ph / 2, pw, ph);
  ctx.clip();

  if (entry && entry.img) {
    ctx.save();
    ctx.translate(-pw / 2, -ph / 2);
    drawPanelPhoto(ctx, pw, ph, entry, pal.grade, fast);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `700 ${Math.round(ph * 0.035)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP A PHOTO', 0, 0);
  }

  // Grade wash: cooler feet, warmer crowns, keeps a set of photos together.
  const wash = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
  wash.addColorStop(0, 'rgba(255,255,255,0.10)');
  wash.addColorStop(0.45, 'rgba(0,0,0,0)');
  wash.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = wash;
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);

  const vig = ctx.createRadialGradient(0, 0, Math.min(pw, ph) * 0.25, 0, 0, Math.max(pw, ph) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig;
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.restore();

  // Border: a light outer keyline and a dark inner one.
  ctx.strokeStyle = 'rgba(255,248,236,0.8)';
  ctx.lineWidth = Math.max(2, 4.2 * u);
  ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.strokeRect(-pw / 2 + 7 * u, -ph / 2 + 7 * u, pw - 14 * u, ph - 14 * u);
  ctx.restore();
}

let halftoneTile = null;
let grainTile = null;

function halftone() {
  if (halftoneTile) return halftoneTile;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(4, 4, 1.45, 0, Math.PI * 2);
  g.fill();
  halftoneTile = c;
  return c;
}

function grain() {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.floor(rnd() * 135);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function drawTexture(ctx, w, h, pal, u) {
  ctx.save();
  const dots = ctx.createPattern(halftone(), 'repeat');
  if (dots) {
    ctx.globalAlpha = pal === PALETTES.day ? 0.10 : 0.16;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = dots;
    ctx.fillRect(0, 0, w, h);
  }
  const noise = ctx.createPattern(grain(), 'repeat');
  if (noise) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function titleFont(size) {
  return `400 ${size}px "Archivo Black", "Arial Black", "Liberation Sans", system-ui, sans-serif`;
}

function splitBalanced(text) {
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (!best || diff < best.diff) best = { lines: [a, b], diff };
  }
  return best ? best.lines : null;
}

function measureTracked(ctx, text, tracking) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + tracking;
  return total - tracking;
}

function measureLines(ctx, lines, tracking) {
  return Math.max(...lines.map((line) => measureTracked(ctx, line, tracking)));
}

/** The largest size at which every line fits the width, starting from `startSize`. */
function fitLines(ctx, lines, maxW, startSize, tracking) {
  let size = startSize;
  ctx.font = titleFont(size);
  while (size > startSize * 0.18 && measureLines(ctx, lines, tracking * size) > maxW) {
    size *= 0.96;
    ctx.font = titleFont(size);
  }
  return size;
}

function fillTracked(ctx, text, x, y, tracking, mode) {
  let cursor = x;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    if (mode === 'stroke') ctx.strokeText(ch, cursor, y);
    else ctx.fillText(ch, cursor, y);
    cursor += cw + tracking;
  }
}

/**
 * Letters the caption: extruded block, ink stroke, accent stroke, gradient fill, the whole line
 * skewed left. `areaH` is the height the block may use; returns the size it settled on.
 */
function drawTitle(ctx, lines, cx, cy, maxW, areaH, pal, u) {
  const tracking = 0.04;
  const perLine = 1.02;
  const blockUnits = (lines.length - 1) * perLine + 0.95;
  const size = fitLines(ctx, lines, maxW, areaH / blockUnits, tracking);
  const lineH = size * perLine;
  const blockH = (lines.length - 1) * lineH + size * 0.95;
  const firstBaseline = cy - blockH / 2 + size * 0.75;
  const skew = -0.13;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.translate(-cx, -cy);
  ctx.font = titleFont(size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const steps = Math.max(3, Math.round(11 * u));
  lines.forEach((line, i) => {
    const y = firstBaseline + i * lineH;
    const lx = cx - measureTracked(ctx, line, tracking * size) / 2;
    ctx.fillStyle = pal.titleInk;
    for (let k = steps; k > 0; k -= 1) {
      const off = k * size * 0.022;
      fillTracked(ctx, line, lx + off, y + off, tracking * size, 'fill');
    }
    ctx.strokeStyle = pal.titleInk;
    ctx.lineWidth = size * 0.135;
    fillTracked(ctx, line, lx, y, tracking * size, 'stroke');
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = size * 0.05;
    fillTracked(ctx, line, lx, y, tracking * size, 'stroke');

    const g = ctx.createLinearGradient(0, y - size * 0.78, 0, y + size * 0.12);
    g.addColorStop(0, pal.title[0]);
    g.addColorStop(1, pal.title[1]);
    ctx.fillStyle = g;
    fillTracked(ctx, line, lx, y, tracking * size, 'fill');
  });
  ctx.restore();
  return size;
}

function drawTitleBand(ctx, w, h, pal, layout, caption, u) {
  const top = layout.bandTop;
  const bandH = layout.bandHeight;

  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, pal.ink);
  g.addColorStop(0.55, '#000000');
  g.addColorStop(1, pal.ink);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);

  const bleed = ctx.createLinearGradient(0, top, 0, top + bandH * 0.55);
  bleed.addColorStop(0, pal.glow);
  bleed.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = bleed;
  ctx.fillRect(0, top, w, bandH * 0.55);
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, top - 1.5 * u, w, 3 * u);
  ctx.globalAlpha = 1;

  const text = (caption || 'YOUR TITLE').trim().toUpperCase().replace(/\s+/g, ' ') || 'YOUR TITLE';

  const areaTop = top + bandH * 0.15;
  const areaBottom = h - bandH * 0.19;
  const areaH = areaBottom - areaTop;
  const cy = (areaTop + areaBottom) / 2;

  let lines = [text];
  let size = drawTitle(ctx, lines, w / 2, cy, w * 0.92, areaH, pal, u);
  const pair = splitBalanced(text);
  if (pair) {
    const probe = fitLines(ctx, pair, w * 0.92, areaH / 1.97, 0.04);
    if (probe > size * 1.2) {
      lines = pair;
      size = drawTitle(ctx, lines, w / 2, cy, w * 0.92, areaH, pal, u);
    }
  }

  // Eyebrow above the lettering, only when the block leaves room for it.
  const blockTop = cy - ((lines.length - 1) * size * 1.02 + size * 0.95) / 2;
  const eye = Math.max(9, bandH * 0.075);
  if (blockTop - top > bandH * 0.16) {
    ctx.font = `400 ${eye}px "Archivo Black", "Liberation Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.9;
    const eyeY = top + bandH * 0.075;
    const eyeW = measureTracked(ctx, pal.tag, eye * 0.34);
    let eyeX = w / 2 - eyeW / 2;
    for (const ch of pal.tag) {
      const cw = ctx.measureText(ch).width;
      ctx.fillText(ch, eyeX + cw / 2, eyeY);
      eyeX += cw + eye * 0.34;
    }
    ctx.globalAlpha = 1;
  }

  const footY = h - bandH * 0.075;
  ctx.font = `600 ${Math.round(14 * u)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,248,236,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('MADE ON YOUR MACHINE', w * 0.042, footY);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(w)} \u00d7 ${Math.round(h)}`, w - w * 0.042, footY);

  ctx.strokeStyle = 'rgba(255,248,236,0.2)';
  ctx.lineWidth = 1 * u;
  ctx.beginPath();
  ctx.moveTo(w * 0.042, footY - bandH * 0.062);
  ctx.lineTo(w - w * 0.042, footY - bandH * 0.062);
  ctx.stroke();
}

function drawFrame(ctx, w, h, pal, u) {
  const inset = w * 0.012;
  ctx.strokeStyle = 'rgba(255,248,236,0.32)';
  ctx.lineWidth = Math.max(1, 1.6 * u);
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  ctx.fillStyle = pal.accent;
  const t = 18 * u;
  const tick = Math.max(1, 2 * u);
  const corners = [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]];
  for (const [x, y, sx, sy] of corners) {
    const x0 = sx > 0 ? x : x - t;
    const y0 = sy > 0 ? y : y - t;
    ctx.fillRect(x0, sy > 0 ? y : y - tick, t, tick);
    ctx.fillRect(sx > 0 ? x : x - tick, y0, tick, t);
  }
}

/** Fits the scene's aspect inside a box, the way the editor sizes its preview. */
export function fitInside(boxW, boxH, aspect) {
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

export { clamp01 };
