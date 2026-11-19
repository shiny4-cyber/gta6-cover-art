// Photo handling: reads the user's files, guesses where the subject is so a crop keeps the head
// in frame, and pushes every panel's crop through one grade so photos from different cameras
// come out looking like they were printed together.

const analysed = new WeakMap();
const MAX_GRADE_WIDTH = 780;

/** Loads a File (or a URL) as a decoded image element. */
export function loadPhoto(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not an image this browser can read.'));
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
  });
}

/**
 * Guesses the point to crop around: {x, y} in 0..1 of the source. Skin-toned pixels in the upper
 * half are taken as a face region; failing that, the busiest area (local contrast) wins, biased
 * upward, which beats a blind centre crop on most snapshots.
 */
export function detectFocus(img) {
  const cached = analysed.get(img);
  if (cached) return cached;

  const sw = 72;
  const sh = Math.max(24, Math.round((sw * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, sw, sh);
  const px = g.getImageData(0, 0, sw, sh).data;

  const lum = new Float32Array(sw * sh);
  let skinTotal = 0;
  let skinSumX = 0;
  let skinSumY = 0;
  const rows = new Float32Array(sh);

  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = (y * sw + x) * 4;
      const r = px[i];
      const gr = px[i + 1];
      const b = px[i + 2];
      lum[y * sw + x] = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
      const mx = Math.max(r, gr, b);
      const mn = Math.min(r, gr, b);
      const isSkin = r > 70 && gr > 34 && b > 18 && mx - mn > 14 && r - gr > 12 && r - b > 16 && gr >= b * 0.82;
      if (isSkin) {
        const w = 1;
        skinTotal += w;
        skinSumX += x * w;
        skinSumY += y * w;
        rows[y] += w;
      }
    }
  }

  const share = skinTotal / (sw * sh);
  let focus;

  if (share > 0.006 && share < 0.72) {
    // Start at the topmost strong skin row (a forehead), then average the band below it: that is
    // the head, not the hands or the sky.
    let rowMax = 0;
    for (let y = 0; y < sh; y += 1) rowMax = Math.max(rowMax, rows[y]);
    let headRow = 0;
    for (let y = 0; y < Math.floor(sh * 0.7); y += 1) {
      const band = rows[y] + (rows[y + 1] || 0) + (rows[y + 2] || 0);
      if (band > rowMax * 0.35) {
        headRow = y;
        break;
      }
    }
    const y0 = Math.max(0, headRow - 1);
    const y1 = Math.min(sh - 1, headRow + Math.round(sh * 0.26));
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = (y * sw + x) * 4;
        const r = px[i];
        const gr = px[i + 1];
        const b = px[i + 2];
        const mx = Math.max(r, gr, b);
        const mn = Math.min(r, gr, b);
        if (r > 70 && gr > 34 && b > 18 && mx - mn > 14 && r - gr > 12 && r - b > 16) {
          sx += x;
          sy += y;
          n += 1;
        }
      }
    }
    focus = n > 0 ? { x: sx / n / sw, y: sy / n / sh, mode: 'face' } : { x: 0.5, y: 0.36, mode: 'centre' };
  } else {
    let sum = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 1; y < sh - 1; y += 1) {
      for (let x = 1; x < sw - 1; x += 1) {
        const e = Math.abs(lum[y * sw + x] - lum[y * sw + x + 1]) + Math.abs(lum[y * sw + x] - lum[(y + 1) * sw + x]);
        const up = 1.7 - (y / sh) * 1.1;
        const w = e * up;
        sum += w;
        sx += x * w;
        sy += y * w;
      }
    }
    focus = sum > 0.001 ? { x: sx / sum / sw, y: sy / sum / sh, mode: 'saliency' } : { x: 0.5, y: 0.4, mode: 'centre' };
  }

  focus.x = Math.min(0.9, Math.max(0.1, focus.x));
  focus.y = Math.min(0.62, Math.max(0.14, focus.y));
  focus.share = share;
  analysed.set(img, focus);
  return focus;
}

/**
 * The crop rectangle in source pixels for a panel of pw x ph holding `entry` (img, focus, zoom),
 * cover-fitted and clamped inside the photo.
 */
export function cropRect(pw, ph, entry) {
  const img = entry.img;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(pw / iw, ph / ih) * (entry.zoom || 1);
  const cw = Math.min(iw, pw / scale);
  const ch = Math.min(ih, ph / scale);
  const fx = entry.focus ? entry.focus.x : 0.5;
  const fy = entry.focus ? entry.focus.y : 0.4;
  const sx = Math.min(Math.max(fx * iw - cw / 2, 0), iw - cw);
  const sy = Math.min(Math.max(fy * ih - ch / 2, 0), ih - ch);
  return { sx, sy, cw, ch, scale };
}

const ramps = new WeakMap();

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A 256-entry duotone ramp from the grade's shadow, mid and highlight colours. */
function rampFor(grade) {
  let ramp = ramps.get(grade);
  if (ramp) return ramp;
  const shadow = hexToRgb(grade.shadow);
  const mid = hexToRgb(grade.mid);
  const high = hexToRgb(grade.high);
  ramp = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let from;
    let to;
    let k;
    if (t < 0.55) {
      from = shadow;
      to = mid;
      k = t / 0.55;
    } else {
      from = mid;
      to = high;
      k = (t - 0.55) / 0.45;
    }
    for (let c = 0; c < 3; c += 1) ramp[i * 3 + c] = from[c] + (to[c] - from[c]) * k;
  }
  ramps.set(grade, ramp);
  return ramp;
}

/** Applies contrast, desaturation and the palette ramp to one panel's pixels in place. */
export function gradeImageData(data, grade) {
  const ramp = rampFor(grade);
  const px = data.data;
  const contrast = grade.contrast;
  const mix = grade.mix;
  const sat = grade.sat;
  const tint = grade.tint || [1, 1, 1];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    let l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    l = (l - 0.46) * contrast + 0.46;
    l = l < 0 ? 0 : l > 1 ? 1 : l;
    const idx = (l * 255) | 0;
    const dr = ramp[idx * 3];
    const dg = ramp[idx * 3 + 1];
    const db = ramp[idx * 3 + 2];
    const gr = (r - l * 255) * sat + l * 255;
    const gg = (g - l * 255) * sat + l * 255;
    const gb = (b - l * 255) * sat + l * 255;
    px[i] = (gr + (dr - gr) * mix) * tint[0];
    px[i + 1] = (gg + (dg - gg) * mix) * tint[1];
    px[i + 2] = (gb + (db - gb) * mix) * tint[2];
  }
}

/** Draws the graded crop at 0,0..pw,ph in the current transform. */
export function drawPanelPhoto(ctx, pw, ph, entry, grade, fast) {
  if (!entry || !entry.img) return;
  const { sx, sy, cw, ch } = cropRect(pw, ph, entry);
  const img = entry.img;

  if (fast) {
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, pw, ph);
    ctx.fillStyle = `rgba(${hexToRgb(grade.mid).join(',')},0.18)`;
    ctx.fillRect(0, 0, pw, ph);
    return;
  }

  const scale = Math.min(1, MAX_GRADE_WIDTH / Math.max(pw, ph, 1));
  const gw = Math.max(2, Math.round(pw * scale));
  const gh = Math.max(2, Math.round(ph * scale));
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, cw, ch, 0, 0, gw, gh);
  const data = g.getImageData(0, 0, gw, gh);
  gradeImageData(data, grade);
  g.putImageData(data, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, gw, gh, 0, 0, pw, ph);
}
