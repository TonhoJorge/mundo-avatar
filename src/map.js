// Criação do globo (MapLibre GL) e camadas do Mundo Avatar.

import { Map as MLMap, NavigationControl, GlobeControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { ERAS, NATION } from './eras.js';

setWorkerUrl(new URL(workerUrl, location.href).href);

export const BASE = new URL(import.meta.env.BASE_URL, location.href).href;
export const MAX_LAT = 85.0511287798066;

const INK = '#3a2a1c';
const HALO = 'rgba(246, 238, 216, 0.92)';
const RANK_MINZOOM = { 1: 0, 2: 2.2, 3: 3.4 };
const RANK_SIZE = { 1: 15, 2: 13.5, 3: 12.5 };

export const PLACE_LAYERS = ['lugares-1', 'lugares-2', 'lugares-3'];
export const LABEL_LAYERS = ['regioes-1', 'regioes-2', 'aguas-2', 'aguas-3', ...PLACE_LAYERS];
export const CLICKABLE_LAYERS = [...PLACE_LAYERS, 'regioes-1', 'regioes-2', 'aguas-2', 'aguas-3'];

const nationText = ['match', ['get', 'nation'], ...Object.entries(NATION).flatMap(([k, v]) => [k, v.text]), INK];

function regionLayer(id, rank, minzoom, maxzoom) {
  return {
    id, type: 'symbol', source: 'lugares', minzoom, maxzoom,
    filter: ['all', ['==', ['get', 'type'], 'region'], ['==', ['get', 'rank'], rank]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['marcellus-sc'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 1, rank === 1 ? 12 : 10, 4, rank === 1 ? 22 : 15],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.16,
      'text-max-width': 8,
      'text-padding': 6,
    },
    paint: { 'text-color': nationText, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-opacity': 0.9 },
  };
}

function waterLayer(id, ranks, minzoom) {
  return {
    id, type: 'symbol', source: 'lugares', minzoom,
    filter: ['all', ['==', ['get', 'type'], 'water'], ['in', ['get', 'rank'], ['literal', ranks]]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['alegreya-italic'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 1, 11, 5, 15],
      'text-letter-spacing': 0.08,
      'text-max-width': 7,
    },
    paint: { 'text-color': '#24506c', 'text-halo-color': 'rgba(214, 232, 236, 0.75)', 'text-halo-width': 1.2 },
  };
}

function placeLayer(rank) {
  return {
    id: `lugares-${rank}`, type: 'symbol', source: 'lugares', minzoom: RANK_MINZOOM[rank],
    filter: ['all', ['!', ['in', ['get', 'type'], ['literal', ['region', 'water']]]], ['==', ['get', 'rank'], rank]],
    layout: {
      'icon-image': ['concat', 'ic-', ['get', 'type'], '-', ['get', 'nation']],
      'icon-padding': 2,
      'text-field': ['get', 'name'],
      'text-font': ['alegreya-regular'],
      'text-size': RANK_SIZE[rank],
      'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
      'text-radial-offset': 0.85,
      'text-justify': 'auto',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'type'], 'legacy'], '#6b6359', INK],
      'text-halo-color': HALO,
      'text-halo-width': 1.4,
      'text-halo-blur': 0.4,
    },
  };
}

export function createMap({ container, meta, era }) {
  const style = {
    version: 8,
    projection: { type: 'globe' },
    glyphs: `${BASE}fonts/{fontstack}/{range}.pbf`,
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: {},
    layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': '#7fa6b4' } }],
  };
  for (const e of ERAS) {
    style.sources[`mundo-${e.id}`] = {
      type: 'raster', tileSize: 256, maxzoom: meta.maxzoom,
      tiles: [`${BASE}tiles/${e.id}/{z}/{x}/{y}.webp`],
    };
    style.layers.push({
      id: `mundo-${e.id}`, type: 'raster', source: `mundo-${e.id}`,
      layout: { visibility: e.id === era ? 'visible' : 'none' },
      paint: { 'raster-fade-duration': 150 },
    });
  }
  for (const set of ['clouds', 'storms']) {
    style.sources[set] = {
      type: 'raster', tileSize: 256, maxzoom: meta.overlaysMaxzoom ?? 2,
      tiles: [`${BASE}overlays/${set}/{z}/{x}/{y}.webp`],
    };
    style.layers.push({
      id: set, type: 'raster', source: set,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
    });
  }
  style.sources.lugares = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  style.layers.push(
    {
      id: 'selecao', type: 'circle', source: 'lugares', filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': 13, 'circle-color': 'rgba(255, 214, 120, 0.28)',
        'circle-stroke-color': '#b8861e', 'circle-stroke-width': 2,
      },
    },
    regionLayer('regioes-2', 2, 1.8, 6.5),
    regionLayer('regioes-1', 1, 0, 5.5),
    waterLayer('aguas-3', [3], 3.4),
    waterLayer('aguas-2', [1, 2], 0),
    placeLayer(3),
    placeLayer(2),
    placeLayer(1),
  );

  const map = new MLMap({
    container,
    style,
    center: [20, 12],
    // globo ocupando ~80% do menor lado da tela
    zoom: 1.6 + Math.log2((0.82 * Math.min(window.innerWidth, window.innerHeight)) / 415),
    minZoom: 0.5,
    maxZoom: meta.maxzoom + 2.5,
    maxPitch: 60,
    hash: 'mapa',
    renderWorldCopies: false,
    fadeDuration: 120,
    maxTileCacheSize: 120,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    attributionControl: {
      compact: true,
      customAttribution: 'Projeto de fã sem fins lucrativos · Avatar © Nickelodeon/Paramount · Mapa procedural original',
    },
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new GlobeControl(), 'bottom-right');
  map.on('styleimagemissing', (e) => addIcon(map, e.id));
  return map;
}

/** Mostra a textura e as nuvens/tempestades da era escolhida. */
export function showEra(map, era, clouds) {
  for (const e of ERAS) map.setLayoutProperty(`mundo-${e.id}`, 'visibility', e.id === era ? 'visible' : 'none');
  const overlay = ERAS.find((e) => e.id === era).overlay;
  for (const set of ['clouds', 'storms']) {
    map.setLayoutProperty(set, 'visibility', clouds && set === overlay ? 'visible' : 'none');
  }
}

export function setLabelsVisible(map, visible) {
  for (const id of LABEL_LAYERS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

export function setSelection(map, id) {
  if (!map.getLayer('selecao')) return; // estilo ainda carregando
  map.setFilter('selecao', ['==', ['get', 'id'], id || '']);
}

/** Converte o catálogo em GeoJSON para a era escolhida. */
export function placesToGeoJSON(places, era, { legacy }) {
  const features = [];
  for (const p of places) {
    const e = p.eras[era];
    const isLegacy = !e && legacy && era === 'havens' && p.rank <= 2
      && p.type !== 'region' && p.type !== 'water' && (p.eras.aang || p.eras.korra);
    if (!e && !isLegacy) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        id: p.id,
        name: e?.name ?? p.name,
        type: isLegacy ? 'legacy' : p.type,
        rank: p.rank,
        nation: e?.nation ?? 'none',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// --- Ícones desenhados sob demanda (ic-<tipo>-<nação>) -------------------
function addIcon(map, id) {
  const m = /^ic-([a-z]+)-([a-z]+)$/.exec(id);
  if (!m || map.hasImage(id)) return;
  const [, type, nation] = m;
  const fill = (NATION[nation] ?? NATION.none).color;
  const c = document.createElement('canvas');
  c.width = c.height = 44;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.translate(11, 11);
  g.lineWidth = 1.4;
  g.strokeStyle = '#2e2116';
  const circle = (r) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); };
  switch (type) {
    case 'capital':
      circle(7); g.fillStyle = '#f6eed8'; g.fill(); g.stroke();
      circle(4.2); g.fillStyle = fill; g.fill();
      break;
    case 'city':
      circle(5); g.fillStyle = fill; g.fill(); g.stroke();
      break;
    case 'village':
      circle(3.4); g.fillStyle = fill; g.fill(); g.stroke();
      break;
    case 'temple':
      g.beginPath(); g.moveTo(0, -7); g.lineTo(6.5, 5); g.lineTo(-6.5, 5); g.closePath();
      g.fillStyle = fill; g.fill(); g.stroke();
      break;
    case 'haven':
      g.shadowColor = 'rgba(255, 200, 80, 0.9)'; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(0, -7.5); g.lineTo(6, 0); g.lineTo(0, 7.5); g.lineTo(-6, 0); g.closePath();
      g.fillStyle = '#e8b84a'; g.fill(); g.shadowBlur = 0; g.stroke();
      break;
    case 'spirit':
      circle(5.5); g.fillStyle = '#e6f2ea'; g.fill(); g.strokeStyle = '#2f7a62'; g.lineWidth = 1.8; g.stroke();
      circle(2); g.fillStyle = '#2f7a62'; g.fill();
      break;
    case 'legacy':
      g.setLineDash([2, 2]); circle(4.5); g.fillStyle = 'rgba(240, 232, 214, 0.7)'; g.fill();
      g.strokeStyle = '#6b6359'; g.stroke();
      break;
    default: // landmark
      g.beginPath(); g.rect(-3.6, -3.6, 7.2, 7.2);
      g.fillStyle = '#f6eed8'; g.fill(); g.strokeStyle = fill; g.lineWidth = 2; g.stroke();
  }
  map.addImage(id, g.getImageData(0, 0, 44, 44), { pixelRatio: 2 });
}
