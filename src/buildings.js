// Cidades em 3D: prédios estilizados (blocos extrudados) gerados na hora, de
// forma determinística, em volta de cada cidade, vila, templo e refúgio.
// Algumas cidades têm forma própria (muralhas de Ba Sing Se, pirâmide de
// Omashu, cúpulas de Zaofu, arranha-céus da Cidade República…).

import { NATION } from './eras.js';

export const BUILDING_LAYERS = ['predios'];
const MINZOOM = 6.2;

const STONE = '#cbbd9e';
const mix = (a, b, f) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

// gerador pseudoaleatório com semente (o mesmo lugar sempre gera a mesma cidade)
function rng(seed) {
  let x = 2166136261;
  for (const ch of seed) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function geo(lon, lat) {
  const kx = 1 / (111.32 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  const ky = 1 / 110.57;
  return (dx, dy) => [lon + dx * kx, lat + dy * ky]; // km -> graus
}

const close = (ring) => [...ring, ring[0]];
function rect(at, cx, cy, w, h, ang = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [close([[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => at(cx + (x * c - y * s) / 2, cy + (x * s + y * c) / 2)))];
}
function circle(at, cx, cy, r, n = 24) {
  return [close(Array.from({ length: n }, (_, i) => at(cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI))))];
}
function ring(at, cx, cy, r, width, n = 64) {
  return [circle(at, cx, cy, r, n)[0], circle(at, cx, cy, r - width, n)[0].reverse()];
}
const EXAGGERATION = 3; // alturas exageradas para as cidades aparecerem bem com a câmera inclinada
const feature = (coords, base, height, color) => ({
  type: 'Feature', geometry: { type: 'Polygon', coordinates: coords },
  properties: { base: base * EXAGGERATION, height: height * EXAGGERATION, color },
});

// bairros genéricos: blocos espalhados num disco, mais altos no centro
function district(out, at, rand, { radius, count, minH, maxH, size, color, roof }) {
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(rand());
    const a = rand() * 2 * Math.PI;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    const w = size * (0.5 + rand()), d = size * (0.5 + rand());
    const center = 1 - r / radius;
    const hgt = minH + (maxH - minH) * (0.25 + 0.75 * center) * (0.6 + 0.4 * rand());
    out.push(feature(rect(at, x, y, w, d, rand() * 0.6), 0, hgt, rand() < 0.3 ? roof : color));
  }
}

function pagoda(out, at, x, y, size, floors, floorH, color, roof) {
  for (let f = 0; f < floors; f++) {
    const s = size * (1 - f * 0.16);
    out.push(feature(rect(at, x, y, s, s), f * floorH, f * floorH + floorH * 0.7, color));
    out.push(feature(rect(at, x, y, s * 1.25, s * 1.25), f * floorH + floorH * 0.7, (f + 1) * floorH, roof));
  }
}

const SPECIAL = {
  'ba-sing-se'(out, at, rand, c) {
    out.push(feature(ring(at, 0, 0, 60, 1.2), 0, 1400, STONE)); // muralha externa
    out.push(feature(ring(at, 0, 0, 34, 0.9), 0, 1100, STONE)); // muralha interna
    out.push(feature(ring(at, 0, 0, 14, 0.6), 0, 700, mix(STONE, c.color, 0.3))); // Anel Superior
    district(out, at, rand, { radius: 31, count: 160, minH: 80, maxH: 260, size: 1.6, color: mix(STONE, c.color, 0.25), roof: c.roof });
    district(out, at, rand, { radius: 12, count: 40, minH: 150, maxH: 420, size: 1.4, color: mix(STONE, c.color, 0.45), roof: c.roof });
    pagoda(out, at, 0, 0, 2.6, 5, 260, '#e8dcc0', c.roof); // Palácio Real
  },
  omashu(out, at, rand, c) {
    for (let i = 0; i < 8; i++) out.push(feature(rect(at, 0, 0, 16 - i * 1.9, 16 - i * 1.9), i * 260, (i + 1) * 260, i % 2 ? STONE : mix(STONE, c.color, 0.3)));
    pagoda(out, at, 0, 0, 2.2, 3, 220, '#e8dcc0', c.roof);
  },
  zaofu(out, at, rand, c) {
    const metal = '#c9c4b2', gold = '#c8a24a';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 2 * Math.PI, x = k ? 7 * Math.cos(a) : 0, y = k ? 7 * Math.sin(a) : 0, r = k ? 3.2 : 4.2;
      for (let s = 0; s < 6; s++) out.push(feature(circle(at, x, y, r * Math.cos((s / 6) * (Math.PI / 2)), 20), s * 140, (s + 1) * 140, s % 2 ? gold : metal));
    }
  },
  'cidade-republica'(out, at, rand, c, era) {
    if (era !== 'korra') return false;
    district(out, at, rand, { radius: 12, count: 150, minH: 120, maxH: 900, size: 0.9, color: '#a8927a', roof: '#6e5a48' });
    out.push(feature(rect(at, 0, 0, 1.4, 1.4), 0, 1300, '#8a6a4a')); // torre central
    out.push(feature(circle(at, 6, -9, 1.6), 0, 900, '#d9c8a0')); // estátua de Aang
  },
  'capital-fogo'(out, at, rand, c) {
    out.push(feature(ring(at, 0, 0, 22, 4, 48), 0, 1600, '#5a4038')); // borda da cratera
    district(out, at, rand, { radius: 15, count: 90, minH: 60, maxH: 220, size: 1.3, color: '#b6624a', roof: '#4a2a22' });
    pagoda(out, at, 0, 4, 3, 4, 300, '#c24a32', '#3a2218'); // palácio
  },
  'tribo-agua-norte'(out, at, rand, c) {
    out.push(feature(ring(at, 0, 0, 18, 1.5, 48), 0, 900, '#e6f0f4')); // muralha de gelo
    district(out, at, rand, { radius: 15, count: 80, minH: 60, maxH: 260, size: 1.4, color: '#dfeaf0', roof: '#7fa6c8' });
    pagoda(out, at, 0, 6, 2.4, 4, 240, '#eef5f8', '#5c86b0');
  },
};

function cityFor(out, p, era) {
  const e = p.eras[era];
  if (!e) return;
  const nation = NATION[e.nation] ?? NATION.none;
  const c = { color: mix(STONE, nation.color, 0.35), roof: mix(nation.color, '#2a2018', 0.35) };
  const at = geo(p.lon, p.lat);
  const rand = rng(`${p.id}:${era}`);
  if (SPECIAL[p.id] && SPECIAL[p.id](out, at, rand, c, era) !== false) return;
  const modern = era === 'korra';
  switch (p.type) {
    case 'capital':
      district(out, at, rand, { radius: 14, count: 110, minH: 60, maxH: modern ? 520 : 300, size: 1.3, ...c });
      pagoda(out, at, 0, 0, 2.4, 4, 240, mix(STONE, nation.color, 0.15), c.roof);
      break;
    case 'city':
      district(out, at, rand, { radius: 8, count: 60, minH: 40, maxH: modern ? 380 : 200, size: 1.1, ...c });
      break;
    case 'haven':
      out.push(feature(ring(at, 0, 0, 9, 0.8), 0, 500, STONE));
      district(out, at, rand, { radius: 8, count: 55, minH: 40, maxH: 260, size: 1, ...c });
      break;
    case 'village':
      district(out, at, rand, { radius: 2.8, count: 16, minH: 20, maxH: 70, size: 0.6, ...c });
      break;
    case 'temple':
      pagoda(out, at, 0, 0, 2.2, 5, 260, '#e9dfc6', c.roof);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 2 * Math.PI + 0.4;
        pagoda(out, at, 4 * Math.cos(a), 4 * Math.sin(a), 1.2, 3, 200, '#e9dfc6', c.roof);
      }
      break;
    default:
  }
}

export function buildingsGeoJSON(places, era) {
  const features = [];
  for (const p of places) cityFor(features, p, era);
  return { type: 'FeatureCollection', features };
}

/** Adiciona a fonte e a camada (chamado na criação do mapa, antes dos rótulos). */
export function buildingLayers() {
  return {
    source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    layer: {
      id: 'predios', type: 'fill-extrusion', source: 'predios', minzoom: MINZOOM,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-base': ['get', 'base'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], MINZOOM, 0, MINZOOM + 0.6, 0.95],
        'fill-extrusion-vertical-gradient': true,
      },
    },
  };
}

let lastKey = '';
export function updateBuildings(map, places, era) {
  const src = map?.getSource('predios');
  if (!src) return;
  const key = `${era}:${places.map((p) => `${p.id}${p.lon}${p.lat}`).join()}`;
  if (key === lastKey) return;
  lastKey = key;
  src.setData(buildingsGeoJSON(places, era));
}

export function setBuildingsVisible(map, visible) {
  if (map.getLayer('predios')) map.setLayoutProperty('predios', 'visibility', visible ? 'visible' : 'none');
}
