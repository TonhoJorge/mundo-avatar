// Modo editor (carregado sob demanda): arrastar marcadores, exportar o catálogo
// e sobrepor uma imagem de referência (ex.: o mapa oficial) para calibrar posições.

import { MAX_LAT, PLACE_LAYERS } from './map.js';
import { h, formatCoord, copyText } from './util.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/tonhojorge/mundo-avatar';

const OVERLAY_SIZE = 2048; // resolução da sobreposição reprojetada (Mercator)
const WORLD = [[-180, MAX_LAT], [180, MAX_LAT], [180, -MAX_LAT], [-180, -MAX_LAT]];
const round = (x) => Math.round(x * 100) / 100;

export function startEditor({ map, getBase, getEdits, setEdit, clearEdits, toast }) {
  let dragging = null;
  let frame = 0;
  let lastMove = null;
  let overlayUrl = null;

  // ---------------- arrastar marcadores ----------------
  const onDown = (e) => {
    const f = e.features?.[0];
    if (!f || (e.originalEvent.touches && e.originalEvent.touches.length > 1)) return;
    e.preventDefault();
    dragging = f.properties.id;
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!dragging) return;
    lastMove = e.lngLat;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (dragging && lastMove) setEdit(dragging, [round(lastMove.lng), round(lastMove.lat)]);
    });
  };
  const onUp = () => {
    if (!dragging) return;
    if (lastMove) toast(`${dragging}: ${formatCoord(lastMove.lng, lastMove.lat, t('coord.letters'))}`);
    dragging = null;
    lastMove = null;
    map.dragPan.enable();
    map.getCanvas().style.cursor = '';
    updateCount();
  };
  for (const id of PLACE_LAYERS) {
    map.on('mousedown', id, onDown);
    map.on('touchstart', id, onDown);
  }
  map.on('mousemove', onMove);
  map.on('touchmove', onMove);
  map.on('mouseup', onUp);
  map.on('touchend', onUp);

  // ---------------- painel ----------------
  const count = h('strong', {});
  const updateCount = () => { count.textContent = String(Object.keys(getEdits()).length); };
  const file = h('input', { type: 'file', accept: 'image/*' });
  const bounds = ['editor.west', 'editor.south', 'editor.east', 'editor.north'].map((k) => t(k)).map((label, i) => h('label', {}, label,
    h('input', { type: 'number', step: '0.1', value: String([-180, -90, 180, 90][i]), min: i % 2 ? '-90' : '-180', max: i % 2 ? '90' : '180' })));
  const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.6', 'aria-label': t('editor.opacity') });

  const panel = h('section', { class: 'editor', 'aria-label': t('editor.title') },
    h('h3', {}, t('editor.title')),
    h('p', {}, t('editor.help')),
    h('p', {}, t('editor.count'), ' ', count),
    h('div', { class: 'acoes' },
      h('button', { type: 'button', onclick: sendToGitHub }, t('editor.send')),
      h('button', { type: 'button', onclick: exportJSON }, t('editor.export')),
      h('button', { type: 'button', onclick: () => { if (confirm(t('editor.confirmDiscard'))) { clearEdits(); updateCount(); } } }, t('editor.discard'))),
    h('p', { class: 'dica' }, t('editor.devNote'), ' ', h('a', { href: `${REPO}/issues/new?template=pedido-dev.yml`, target: '_blank', rel: 'noopener' }, t('editor.devRequest'))),
    h('fieldset', {},
      h('legend', {}, t('editor.overlay')),
      h('p', { class: 'dica' }, t('editor.overlayHelp')),
      file,
      h('div', { class: 'limites' }, bounds),
      h('label', { class: 'opacidade' }, t('editor.opacity'), opacity),
      h('div', { class: 'acoes' },
        h('button', { type: 'button', onclick: applyOverlay }, t('editor.apply')),
        h('button', { type: 'button', onclick: removeOverlay }, t('editor.remove')))),
  );
  document.body.append(panel);
  updateCount();

  opacity.addEventListener('input', () => {
    if (map.getLayer('calibracao')) map.setPaintProperty('calibracao', 'raster-opacity', Number(opacity.value));
  });

  function sendToGitHub() {
    const edits = getEdits();
    const ids = Object.keys(edits);
    if (!ids.length) { toast(t('editor.nothing')); return; }
    const json = JSON.stringify(Object.fromEntries(ids.map((id) => [id, { lon: edits[id][0], lat: edits[id][1] }])), null, 1);
    const url = `${REPO}/issues/new?template=contribuicao-dev.yml&title=${encodeURIComponent(t('editor.issueTitle', { n: ids.length }))}&posicoes=${encodeURIComponent(json)}`;
    if (url.length > 7900) { toast(t('editor.tooMany')); return; }
    window.open(url, '_blank', 'noopener');
  }

  function exportJSON() {
    const edits = getEdits();
    const places = getBase().map((p) => (edits[p.id] ? { ...p, lon: edits[p.id][0], lat: edits[p.id][1] } : p));
    const blob = new Blob([`${JSON.stringify({ version: 1, places }, null, 2)}\n`], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'places.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function applyOverlay() {
    const f = file.files?.[0];
    if (!f) { toast(t('editor.pickImage')); return; }
    const [w, s, e, n] = bounds.map((l) => Number(l.querySelector('input').value));
    if (!(w < e && s < n) || [w, e].some((v) => v < -180 || v > 180) || [s, n].some((v) => v < -90 || v > 90)) {
      toast(t('editor.badBounds'));
      return;
    }
    let img;
    try {
      img = await createImageBitmap(f);
    } catch {
      toast(t('editor.badImage'));
      return;
    }
    // reprojeta a imagem plana (equirretangular) para Mercator, linha a linha
    const c = document.createElement('canvas');
    c.width = c.height = OVERLAY_SIZE;
    const g = c.getContext('2d');
    const x0 = ((w + 180) / 360) * OVERLAY_SIZE, xw = ((e - w) / 360) * OVERLAY_SIZE;
    for (let y = 0; y < OVERLAY_SIZE; y++) {
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / OVERLAY_SIZE))) * 180) / Math.PI;
      if (lat > n || lat < s) continue;
      const sy = Math.min(img.height - 1, Math.floor(((n - lat) / (n - s)) * img.height));
      g.drawImage(img, 0, sy, img.width, 1, x0, y, xw, 1);
    }
    img.close();
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    c.width = c.height = 0; // libera memória do canvas
    if (!blob) { toast(t('editor.overlayFailed')); return; }
    const url = URL.createObjectURL(blob);
    const src = map.getSource('calibracao');
    if (src) src.updateImage({ url, coordinates: WORLD });
    else {
      map.addSource('calibracao', { type: 'image', url, coordinates: WORLD });
      map.addLayer({ id: 'calibracao', type: 'raster', source: 'calibracao', paint: { 'raster-opacity': Number(opacity.value), 'raster-fade-duration': 0 } }, 'clouds');
    }
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    overlayUrl = url;
    toast(t('editor.overlayApplied'));
  }

  function removeOverlay() {
    if (map.getLayer('calibracao')) map.removeLayer('calibracao');
    if (map.getSource('calibracao')) map.removeSource('calibracao');
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    overlayUrl = null;
  }

  return {
    async onMapClick(e) {
      const text = `${round(e.lngLat.lng)}, ${round(e.lngLat.lat)}`;
      toast((await copyText(text)) ? t('editor.copied', { text }) : `lon, lat = ${text}`);
    },
    stop() {
      for (const id of PLACE_LAYERS) {
        map.off('mousedown', id, onDown);
        map.off('touchstart', id, onDown);
      }
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', onUp);
      map.off('touchend', onUp);
      if (frame) cancelAnimationFrame(frame);
      onUp();
      removeOverlay();
      panel.remove();
    },
  };
}
