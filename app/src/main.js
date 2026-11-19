// The editor: photos in, a live multi-panel cover out, exported as a PNG. All state is one
// object; every control writes to it and every write asks for a redraw.
//
// Nothing leaves the page: photos are read with URL.createObjectURL, drawn to a canvas and
// dropped. The app makes no network request at all, so index.html works from a plain file server
// on a machine with the network unplugged.

import { PALETTES, LAYOUTS, layoutScene, drawCoverArt, fitInside } from './cover.js';
import { loadPhoto, detectFocus, cropRect } from './photo.js';
import { runShot } from './shots.js';

const SIZES = [
  { id: 'print', label: 'Print 1600 \u00d7 2000', w: 1600, h: 2000 },
  { id: 'portrait', label: 'Post 1080 \u00d7 1350', w: 1080, h: 1350 },
  { id: 'square', label: 'Square 1080 \u00d7 1080', w: 1080, h: 1080 },
  { id: 'wide', label: 'Wide 1920 \u00d7 1080', w: 1920, h: 1080 },
];

const state = {
  caption: 'SUNSET HEIST',
  palette: 'sunset',
  layout: 'triptych',
  size: 'print',
  photos: [],
  panels: Array.from({ length: 6 }, (_, i) => ({ photo: -1, focus: { x: 0.5, y: 0.4 }, zoom: 1 + (i % 3) * 0.05 })),
  selected: 0,
  fast: false,
  lastExport: null,
};

const ui = {};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sizeById(id) {
  return SIZES.find((s) => s.id === id) || SIZES[0];
}

function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

/** The scene the art engine draws: plain data, no DOM. */
function scene() {
  return {
    caption: state.caption,
    palette: state.palette,
    layout: state.layout,
    fast: state.fast,
    panels: state.panels.map((p) => {
      const photo = state.photos[p.photo];
      return photo ? { img: photo.img, focus: p.focus, zoom: p.zoom } : null;
    }),
  };
}

/** Draws the hero cover at an exact pixel size (used by the exporter and the screenshot scenes). */
export function renderCoverTo(ctx, w, h) {
  drawCoverArt(ctx, w, h, scene());
}

/** Sizes the preview canvas to the stage (or to an exact box) and draws the cover into it. */
function render(opts = {}) {
  const size = sizeById(state.size);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let cssW;
  let cssH;
  if (opts.exact) {
    cssW = opts.exact.w;
    cssH = opts.exact.h;
  } else {
    const r = ui.stageInner.getBoundingClientRect();
    const fit = fitInside(Math.max(120, r.width - 8), Math.max(120, r.height - 8), size.w / size.h);
    cssW = fit.w;
    cssH = fit.h;
  }
  ui.canvas.style.width = `${cssW}px`;
  ui.canvas.style.height = `${cssH}px`;
  const bw = Math.max(2, Math.round(cssW * dpr));
  const bh = Math.max(2, Math.round(cssH * dpr));
  if (ui.canvas.width !== bw || ui.canvas.height !== bh) {
    ui.canvas.width = bw;
    ui.canvas.height = bh;
  }
  drawCoverArt(ui.ctx, ui.canvas.width, ui.canvas.height, scene());
  updateReadout();
}

let queued = 0;

/** Coalesces redraws to one per frame, so dragging stays smooth. */
function scheduleRender(fast) {
  state.fast = fast === true;
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    render();
    state.fast = false;
  });
}

function updateReadout() {
  const size = sizeById(state.size);
  const layout = layoutById(state.layout);
  const panel = state.panels[state.selected];
  const photo = panel ? state.photos[panel.photo] : null;
  const which = `panel ${state.selected + 1} of ${layout.count}`;
  const mode = photo && photo.focus.mode === 'face' ? 'head found' : photo ? 'auto-framed' : 'empty';
  ui.readout.textContent = `${size.w} \u00d7 ${size.h} PNG \u00b7 ${layout.label.toLowerCase()} \u00b7 ${which} \u00b7 ${mode}`;
}

// ---------------------------------------------------------------- photos

async function addFiles(files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!list.length) {
    setStatus('Those files are not images.');
    return;
  }
  for (const file of list) {
    try {
      const img = await loadPhoto(file);
      const focus = detectFocus(img);
      state.photos.push({ img, name: file.name, focus });
      placePhoto(state.photos.length - 1, state.photos.length === 1);
      setStatus(`${file.name}: ${focus.mode === 'face' ? 'head found, framed on it' : 'auto-framed'}.`);
    } catch (err) {
      setStatus(err.message);
    }
  }
  renderThumbs();
  renderInspector();
  scheduleRender(false);
}

/** Puts a photo in the selected panel, or in every panel when it is the first one added. */
function placePhoto(index, fillAll) {
  const photo = state.photos[index];
  if (!photo) return;
  if (fillAll) {
    state.panels.forEach((p, i) => {
      p.photo = index;
      p.focus = {
        x: clamp(photo.focus.x + (i - 2) * 0.012, 0.06, 0.94),
        y: clamp(photo.focus.y - 0.015 + (i % 2) * 0.03, 0.1, 0.7),
      };
      p.zoom = 1 + (i % 3) * 0.05;
    });
    return;
  }
  const panel = state.panels[state.selected];
  panel.photo = index;
  panel.focus = { x: photo.focus.x, y: photo.focus.y };
  panel.zoom = 1.02;
}

function removePhoto(index) {
  state.photos.splice(index, 1);
  for (const p of state.panels) {
    if (p.photo === index) p.photo = -1;
    else if (p.photo > index) p.photo -= 1;
  }
  renderThumbs();
  renderInspector();
  scheduleRender(false);
}

function renderThumbs() {
  ui.thumbs.textContent = '';
  state.photos.forEach((photo, i) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    img.title = photo.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '\u00d7';
    del.title = `Remove ${photo.name}`;
    del.setAttribute('aria-label', `Remove ${photo.name}`);
    del.addEventListener('click', () => removePhoto(i));
    li.append(img, del);
    ui.thumbs.append(li);
  });
}

// ---------------------------------------------------------------- inspector

function renderInspector() {
  const layout = layoutById(state.layout);
  ui.inspector.textContent = '';

  const picks = document.createElement('div');
  picks.className = 'panel-picks';
  picks.setAttribute('role', 'group');
  picks.setAttribute('aria-label', 'Panel to edit');
  for (let i = 0; i < layout.count; i += 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-pick';
    b.textContent = String(i + 1);
    b.setAttribute('aria-pressed', String(state.selected === i));
    b.title = `Edit panel ${i + 1}`;
    b.addEventListener('click', () => {
      state.selected = i;
      renderInspector();
      updateReadout();
    });
    picks.append(b);
  }
  ui.inspector.append(picks);

  if (!state.photos.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Add a photo: it fills every panel, and you can swap panels one at a time.';
    ui.inspector.append(hint);
    return;
  }

  const useRow = document.createElement('div');
  useRow.className = 'row';
  const useLabel = document.createElement('span');
  useLabel.className = 'label';
  useLabel.textContent = `Photo in panel ${state.selected + 1}`;
  useRow.append(useLabel);
  state.photos.forEach((photo, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${i + 1}`;
    b.title = `Use ${photo.name} in panel ${state.selected + 1}`;
    b.addEventListener('click', () => {
      placePhoto(i, false);
      scheduleRender(false);
      renderInspector();
    });
    useRow.append(b);
  });
  ui.inspector.append(useRow);

  const zoomRow = document.createElement('div');
  zoomRow.className = 'row';
  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.textContent = '\u2212 zoom';
  zoomOut.addEventListener('click', () => nudgeZoom(-0.12));
  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.textContent = '+ zoom';
  zoomIn.addEventListener('click', () => nudgeZoom(0.12));
  const recentre = document.createElement('button');
  recentre.type = 'button';
  recentre.textContent = 'Fit head';
  recentre.title = 'Frame this panel on the subject again';
  recentre.addEventListener('click', () => {
    const panel = state.panels[state.selected];
    const photo = state.photos[panel.photo];
    if (!photo) return;
    panel.focus = { x: photo.focus.x, y: photo.focus.y };
    panel.zoom = 1.02;
    scheduleRender(false);
  });
  zoomRow.append(zoomOut, zoomIn, recentre);
  ui.inspector.append(zoomRow);

  const fillRow = document.createElement('div');
  fillRow.className = 'row';
  const fill = document.createElement('button');
  fill.type = 'button';
  fill.textContent = 'Use this photo in every panel';
  fill.addEventListener('click', () => {
    const panel = state.panels[state.selected];
    if (panel.photo < 0) return;
    const keep = panel.photo;
    state.panels.forEach((p, i) => {
      const source = state.photos[keep];
      p.photo = keep;
      p.focus = { x: clamp(source.focus.x + (i - 2) * 0.015, 0.06, 0.94), y: clamp(source.focus.y + (i % 2) * 0.04, 0.1, 0.7) };
      p.zoom = 1 + (i % 3) * 0.06;
    });
    scheduleRender(false);
    renderInspector();
  });
  fillRow.append(fill);
  ui.inspector.append(fillRow);
}

// ---------------------------------------------------------------- panels: picking, dragging

function canvasPoint(ev) {
  const r = ui.canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / r.width) * ui.canvas.width,
    y: ((ev.clientY - r.top) / r.height) * ui.canvas.height,
  };
}

function inPanel(rect, x, y) {
  const dx = x - rect.cx;
  const dy = y - rect.cy;
  const ux = dx - rect.skew * dy;
  const c = Math.cos(-rect.rot);
  const s = Math.sin(-rect.rot);
  const lx = ux * c - dy * s;
  const ly = ux * s + dy * c;
  return Math.abs(lx) <= rect.pw / 2 && Math.abs(ly) <= rect.ph / 2;
}

function panelsOnCanvas() {
  return layoutScene(ui.canvas.width, ui.canvas.height, state.layout).panels;
}

function panelAt(x, y) {
  const list = panelsOnCanvas().slice().sort((a, b) => b.z - a.z || b.index - a.index);
  for (const rect of list) if (inPanel(rect, x, y)) return rect;
  return null;
}

function rectFor(index) {
  return panelsOnCanvas().find((r) => r.index === index) || null;
}

/** Drag, wheel and keys all reframe the selected panel the same way: move its crop window. */
function reframe(index, dxCanvas, dyCanvas) {
  const panel = state.panels[index];
  const photo = state.photos[panel.photo];
  const rect = rectFor(index);
  if (!photo || !rect) return;
  const { scale } = cropRect(rect.pw, rect.ph, { img: photo.img, focus: panel.focus, zoom: panel.zoom });
  panel.focus.x = clamp(panel.focus.x - dxCanvas / scale / photo.img.naturalWidth, 0, 1);
  panel.focus.y = clamp(panel.focus.y - dyCanvas / scale / photo.img.naturalHeight, 0, 1);
}

function nudgeZoom(delta) {
  const panel = state.panels[state.selected];
  if (panel.photo < 0) return;
  panel.zoom = clamp(panel.zoom + delta, 1, 3.2);
  scheduleRender(false);
}

// ---------------------------------------------------------------- export

async function makeExportBlob() {
  const size = sizeById(state.size);
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  drawCoverArt(c.getContext('2d'), size.w, size.h, scene());
  return new Promise((resolve) => {
    c.toBlob((blob) => resolve({ blob, size }), 'image/png');
  });
}

function showResult(blob, size, name) {
  if (state.lastExport) URL.revokeObjectURL(state.lastExport.url);
  const url = URL.createObjectURL(blob);
  state.lastExport = { blob, url, name, size };
  ui.resultImg.src = url;
  ui.resultMeta.textContent = `${name} \u00b7 ${size.w} \u00d7 ${size.h} \u00b7 ${Math.round(blob.size / 1024)} KB`;
  ui.result.hidden = false;
  ui.shell.classList.add('has-result');
}

function downloadLast() {
  if (!state.lastExport) return;
  const a = document.createElement('a');
  a.href = state.lastExport.url;
  a.download = state.lastExport.name;
  document.body.append(a);
  a.click();
  a.remove();
}

async function exportPng(opts = {}) {
  setStatus('Drawing the PNG\u2026');
  const { blob, size } = await makeExportBlob();
  const name = `cover-${size.w}x${size.h}.png`;
  if (!blob) {
    setStatus('The browser could not encode the PNG. Try a smaller size.');
    return null;
  }
  showResult(blob, size, name);
  if (opts.download !== false) downloadLast();
  setStatus(`Saved ${name} (${Math.round(blob.size / 1024)} KB).`);
  return blob;
}

function setStatus(text) {
  ui.status.textContent = text;
}

// ---------------------------------------------------------------- wiring

function buildPaletteChips() {
  Object.entries(PALETTES).forEach(([id, pal]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.dataset.palette = id;
    b.setAttribute('aria-checked', String(state.palette === id));
    const swatch = document.createElement('i');
    swatch.style.background = `linear-gradient(160deg, ${pal.sky[1]}, ${pal.sky[2]} 45%, ${pal.sky[4]})`;
    b.append(swatch, document.createTextNode(pal.label));
    b.addEventListener('click', () => {
      state.palette = id;
      for (const chip of ui.palettes.querySelectorAll('.chip')) chip.setAttribute('aria-checked', String(chip.dataset.palette === id));
      scheduleRender(false);
    });
    ui.palettes.append(b);
  });
}

function buildSelects() {
  LAYOUTS.forEach((l) => {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = `${l.label}`;
    ui.layout.append(o);
  });
  ui.layout.value = state.layout;
  SIZES.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    ui.size.append(o);
  });
  ui.size.value = state.size;
}

function wireEvents() {
  ui.file.addEventListener('change', () => {
    addFiles(ui.file.files);
    ui.file.value = '';
  });

  ui.drop.addEventListener('click', () => ui.file.click());
  ui.drop.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ui.file.click();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    ui.drop.addEventListener(type, (ev) => {
      ev.preventDefault();
      ui.drop.classList.add('over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    ui.drop.addEventListener(type, (ev) => {
      ev.preventDefault();
      ui.drop.classList.remove('over');
    });
  }
  ui.drop.addEventListener('drop', (ev) => {
    if (ev.dataTransfer && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files);
  });

  // A photo dropped anywhere on the page works too, so the first step is one gesture.
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files);
  });

  ui.caption.addEventListener('input', () => {
    state.caption = ui.caption.value;
    scheduleRender(false);
  });

  ui.layout.addEventListener('change', () => {
    state.layout = ui.layout.value;
    state.selected = Math.min(state.selected, layoutById(state.layout).count - 1);
    renderInspector();
    scheduleRender(false);
  });

  ui.size.addEventListener('change', () => {
    state.size = ui.size.value;
    scheduleRender(false);
    ui.sizeNote.textContent = `${sizeById(state.size).w} \u00d7 ${sizeById(state.size).h} pixels, PNG.`;
  });

  ui.export.addEventListener('click', () => exportPng());
  ui.resultDownload.addEventListener('click', downloadLast);

  let drag = null;
  ui.canvas.addEventListener('pointerdown', (ev) => {
    const p = canvasPoint(ev);
    const rect = panelAt(p.x, p.y);
    if (!rect) return;
    state.selected = rect.index;
    ui.canvas.setPointerCapture(ev.pointerId);
    ui.canvas.classList.add('dragging');
    drag = { x: p.x, y: p.y, index: rect.index };
    renderInspector();
    updateReadout();
  });

  ui.canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = canvasPoint(ev);
    reframe(drag.index, p.x - drag.x, p.y - drag.y);
    drag.x = p.x;
    drag.y = p.y;
    scheduleRender(true);
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    ui.canvas.classList.remove('dragging');
    scheduleRender(false);
  };
  ui.canvas.addEventListener('pointerup', endDrag);
  ui.canvas.addEventListener('pointercancel', endDrag);

  ui.canvas.addEventListener('wheel', (ev) => {
    const p = canvasPoint(ev);
    const rect = panelAt(p.x, p.y);
    if (!rect) return;
    ev.preventDefault();
    state.selected = rect.index;
    const panel = state.panels[rect.index];
    if (panel.photo < 0) return;
    panel.zoom = clamp(panel.zoom * Math.exp(-ev.deltaY * 0.0016), 1, 3.2);
    scheduleRender(false);
    updateReadout();
  }, { passive: false });

  ui.canvas.addEventListener('keydown', (ev) => {
    const panel = state.panels[state.selected];
    const step = ev.shiftKey ? 18 : 7;
    const keys = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (keys[ev.key]) {
      ev.preventDefault();
      reframe(state.selected, keys[ev.key][0], keys[ev.key][1]);
      scheduleRender(false);
      return;
    }
    if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault();
      nudgeZoom(0.12);
    } else if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault();
      nudgeZoom(-0.12);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const next = panel.photo < 0 ? 0 : (panel.photo + 1) % Math.max(1, state.photos.length);
      if (state.photos[next]) {
        placePhoto(next, false);
        scheduleRender(false);
        renderInspector();
      }
    }
  });

  window.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'e') {
      ev.preventDefault();
      exportPng();
    }
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      render();
    });
  });
}

function cacheUi() {
  ui.canvas = document.getElementById('cover');
  ui.ctx = ui.canvas.getContext('2d');
  ui.stageInner = document.getElementById('stage-inner');
  ui.drop = document.getElementById('drop');
  ui.file = document.getElementById('file');
  ui.thumbs = document.getElementById('thumbs');
  ui.caption = document.getElementById('caption');
  ui.palettes = document.getElementById('palettes');
  ui.layout = document.getElementById('layout');
  ui.inspector = document.getElementById('inspector');
  ui.size = document.getElementById('size');
  ui.sizeNote = document.getElementById('size-note');
  ui.export = document.getElementById('export');
  ui.status = document.getElementById('status');
  ui.readout = document.getElementById('readout');
  ui.result = document.getElementById('result');
  ui.resultImg = document.getElementById('result-img');
  ui.resultMeta = document.getElementById('result-meta');
  ui.resultDownload = document.getElementById('result-download');
  ui.shell = document.querySelector('.shell');
}

/** The display face is a file under app/fonts: wait for it, or the first frame letters in a fallback. */
async function loadTitleFont() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await document.fonts.load('64px "Archivo Black"');
    await document.fonts.ready;
  } catch {
    /* the stack in cover.js has fallbacks */
  }
}

async function boot() {
  cacheUi();
  buildPaletteChips();
  buildSelects();
  wireEvents();
  ui.caption.value = state.caption;
  ui.sizeNote.textContent = `${sizeById(state.size).w} \u00d7 ${sizeById(state.size).h} pixels, PNG.`;
  await loadTitleFont();

  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot) {
    runShot(shot, params, {
      state,
      ui,
      render,
      renderInspector,
      renderThumbs,
      exportPng,
      setStatus,
      placePhoto,
      SIZES,
      sizeById,
    }).catch((err) => {
      setStatus(`Screenshot scene failed: ${err.message}`);
      render();
    });
  } else {
    render();
  }
}

boot();
