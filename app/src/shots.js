// Fixed scenes for the screenshots: `?shot=cover|detail|editor|result` sets the app up exactly as
// a capture needs it — same engine, same controls, real drawing. `?photo=` picks the sample files
// from samples/, `palette=`, `layout=`, `size=` and `caption=` set the rest. window.__shotReady is
// set once the frame is on screen, so the capture never races the canvas.

import { drawCoverArt, layoutScene } from './cover.js';
import { loadPhoto, detectFocus } from './photo.js';

function applyQuery(shot, params, api) {
  const { state } = api;
  state.caption = params.get('caption') || 'SUNSET HEIST';
  state.palette = params.get('palette') || 'sunset';
  state.layout = params.get('layout') || 'triptych';
  state.size = params.get('size') || 'print';
  api.ui.caption.value = state.caption;
  api.ui.layout.value = state.layout;
  api.ui.size.value = state.size;
  for (const chip of api.ui.palettes.querySelectorAll('.chip')) {
    chip.setAttribute('aria-checked', String(chip.dataset.palette === state.palette));
  }
  if (shot === 'cover' || shot === 'detail') document.body.classList.add('fullbleed');
  if (shot === 'result') document.body.classList.add('with-result');
}

async function loadSamples(names, api) {
  const { state } = api;
  const images = await Promise.all(names.map((n) => loadPhoto(`samples/${n}.jpg`)));
  state.photos = images.map((img, i) => ({ img, name: `${names[i]}.jpg`, focus: detectFocus(img) }));

  state.panels.forEach((panel, i) => {
    const photo = state.photos[i % state.photos.length];
    panel.photo = i % state.photos.length;
    panel.focus = {
      x: Math.min(0.92, Math.max(0.08, photo.focus.x + ((i % 3) - 1) * 0.015)),
      y: Math.min(0.7, Math.max(0.12, photo.focus.y + ((i % 2) - 0.5) * 0.03)),
    };
    panel.zoom = 1.02 + (i % 3) * 0.04;
  });
  api.renderThumbs();
  api.renderInspector();
}

function shotReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}

function drawZoom(ctx, canvas, source, bandTop, bandHeight) {
  const aspect = canvas.width / canvas.height;
  let sh = bandHeight * 1.22;
  let sw = sh * aspect;
  if (sw > source.width * 0.98) {
    sw = source.width * 0.98;
    sh = sw / aspect;
  }
  const sx = (source.width - sw) / 2;
  let sy = bandTop - sh * 0.1;
  sy = Math.min(Math.max(sy, 0), source.height - sh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

/** Runs the scene the query asks for; resolves once the canvas is painted. */
export async function runShot(shot, params, api) {
  applyQuery(shot, params, api);

  const names = (params.get('photos') || 'rider,neon,boulevard').split(',').filter(Boolean);
  await loadSamples(names, api);

  const size = api.sizeById(api.state.size);

  if (shot === 'cover') {
    document.body.classList.add('fullbleed');
    const w = window.innerWidth;
    const h = window.innerHeight;
    api.render({ exact: { w, h } });
    shotReady();
    return;
  }

  if (shot === 'detail') {
    document.body.classList.add('fullbleed');
    const w = window.innerWidth;
    const h = window.innerHeight;
    api.render({ exact: { w, h } });
    const source = document.createElement('canvas');
    source.width = size.w;
    source.height = size.h;
    drawCoverArt(source.getContext('2d'), size.w, size.h, {
      caption: api.state.caption,
      palette: api.state.palette,
      layout: api.state.layout,
      fast: false,
      panels: api.state.panels.map((p) => {
        const photo = api.state.photos[p.photo];
        return photo ? { img: photo.img, focus: p.focus, zoom: p.zoom } : null;
      }),
    });
    const layout = layoutScene(size.w, size.h, api.state.layout);
    drawZoom(api.ui.ctx, api.ui.canvas, source, layout.bandTop, layout.bandHeight);
    shotReady();
    return;
  }

  api.render();
  if (shot === 'result') {
    await api.exportPng({ download: false });
  }
  shotReady();
}
