#!/usr/bin/env node
// Gera os tiles do Mundo Avatar (projeção Web Mercator, padrão XYZ do MapLibre)
// para cada era, mais nuvens/tempestades e imagens de prévia.
//
//   node tools/render-world.mjs                  # todas as eras, zoom 0–6
//   node tools/render-world.mjs --max-zoom 3     # rápido, para testes
//   node tools/render-world.mjs --era aang --out dist
//
// Saída (em --out, padrão "public"):
//   tiles/<era>/<z>/<x>/<y>.webp      tiles/meta.json
//   overlays/<clouds|storms>/<z>/<x>/<y>.webp
//   previews/<era>.jpg                (equirretangular 2048x1024)
//
// Tudo é procedural e original: um estilo de "mapa pintado em pergaminho"
// inspirado na série. Para usar a arte oficial, veja docs/ARTE-OFICIAL.md.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as G from '../world/geography.mjs';
import { oldLatToMercator } from '../world/projection.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ERAS = ['aang', 'korra', 'havens'];
const NATIONS = ['none', 'earth', 'fire', 'water', 'air', 'republic', 'havens'];
const D2R = Math.PI / 180;
// força da tinta de cada nação sobre o mapa (Ar quase branco, como no mapa oficial)
const TINT_WEIGHT = { air: 0.62, fire: 0.32, water: 0.62, earth: 0.22, republic: 0.26, havens: 0.2 };
const LAND_TYPES = new Set(['capital', 'city', 'village', 'temple', 'haven', 'landmark', 'spirit']);
const RIPPLES = [[4, 0.34], [8.5, 0.24], [14, 0.15]]; // linhas paralelas à costa: [px, intensidade]

// ---------------------------------------------------------------------------
// Ruído de gradiente 3D amostrado na esfera (sem costura e sem distorção polar)
// ---------------------------------------------------------------------------
const GRAD = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 1, 1, 0, -1, 1, 0, 0, -1, 1, 0, -1, -1]);
function g3(ix, iy, iz, s, x, y, z) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1440662683) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const i = ((h ^ (h >>> 16)) & 15) * 3;
  return GRAD[i] * x + GRAD[i + 1] * y + GRAD[i + 2] * z;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function perlin3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const n000 = g3(ix, iy, iz, s, fx, fy, fz), n100 = g3(ix + 1, iy, iz, s, fx - 1, fy, fz);
  const n010 = g3(ix, iy + 1, iz, s, fx, fy - 1, fz), n110 = g3(ix + 1, iy + 1, iz, s, fx - 1, fy - 1, fz);
  const n001 = g3(ix, iy, iz + 1, s, fx, fy, fz - 1), n101 = g3(ix + 1, iy, iz + 1, s, fx - 1, fy, fz - 1);
  const n011 = g3(ix, iy + 1, iz + 1, s, fx, fy - 1, fz - 1), n111 = g3(ix + 1, iy + 1, iz + 1, s, fx - 1, fy - 1, fz - 1);
  const x00 = n000 + u * (n100 - n000), x10 = n010 + u * (n110 - n010);
  const x01 = n001 + u * (n101 - n001), x11 = n011 + u * (n111 - n011);
  const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
  return y0 + w * (y1 - y0);
}
const P = new Float64Array(3); // ponto atual na esfera unitária
function setP(lon, lat) {
  const c = Math.cos(lat * D2R);
  P[0] = c * Math.cos(lon * D2R); P[1] = c * Math.sin(lon * D2R); P[2] = Math.sin(lat * D2R);
}
// cells = nº aproximado de células numa volta completa do globo.
// Normalizado para desvio-padrão ≈ 0,35 (valores típicos em -1..1).
function fbm(cells, oct, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = cells / (2 * Math.PI);
  for (let o = 0; o < oct; o++) {
    sum += amp * perlin3(P[0] * f + 31.7 * o, P[1] * f, P[2] * f, seed + o);
    norm += amp; amp *= gain; f *= 2;
  }
  return (sum / norm) * 2.25;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const byte = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);

// ---------------------------------------------------------------------------
// Rasterização em baixa resolução (thread principal)
// ---------------------------------------------------------------------------
function fillPoly(buf, W, H, poly, value) {
  const pts = poly.map(([lon, lat]) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.round(xs[k])), b = Math.min(W - 1, Math.round(xs[k + 1]) - 1);
      for (let x = a; x <= b; x++) buf[y * W + x] = value;
    }
  }
}

function boxBlur(src, W, H, r, passes) {
  let a = Float32Array.from(src);
  const b = new Float32Array(src.length), n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) { // horizontal, com repetição em ±180°
      const row = y * W;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[row + ((k % W) + W) % W];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc / n;
        acc += a[row + ((x + r + 1) % W)] - a[row + (((x - r) % W) + W) % W];
      }
    }
    for (let x = 0; x < W; x++) { // vertical, borda presa
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[Math.min(H - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc / n;
        acc += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
  }
  return a;
}

function lineField(W, H, lines) {
  const out = new Float32Array(W * H);
  const dpp = 360 / W;
  for (const L of lines) {
    const h = L.height ?? L.depth ?? 1;
    for (let s = 0; s + 1 < L.line.length; s++) {
      const [ax, ay] = L.line[s], [bx, by] = L.line[s + 1];
      const pad = L.width * 2.2;
      const px0 = Math.floor((Math.min(ax, bx) - pad + 180) / dpp), px1 = Math.ceil((Math.max(ax, bx) + pad + 180) / dpp);
      const py0 = Math.max(0, Math.floor((90 - Math.max(ay, by) - pad) / dpp));
      const py1 = Math.min(H - 1, Math.ceil((90 - Math.min(ay, by) + pad) / dpp));
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      for (let py = py0; py <= py1; py++) {
        const lat = 90 - (py + 0.5) * dpp;
        for (let pxr = px0; pxr <= px1; pxr++) {
          const lon = -180 + (pxr + 0.5) * dpp;
          const t = clamp01(((lon - ax) * dx + (lat - ay) * dy) / len2);
          const ex = lon - (ax + t * dx), ey = lat - (ay + t * dy);
          const d = Math.sqrt(ex * ex + ey * ey) / L.width;
          const v = h * Math.exp(-d * d * 2.2);
          const i = py * W + (((pxr % W) + W) % W);
          if (v > out[i]) out[i] = v;
        }
      }
    }
  }
  return out;
}

const share = (a) => { const s = new Float32Array(new SharedArrayBuffer(a.length * 4)); s.set(a); return s; };

// Moldes extraídos do mapa oficial (tools/trace-official.mjs): contornos, rios,
// montanhas e nações exatos. Sem eles, usa a geografia desenhada à mão.
async function loadTrace() {
  const dir = path.join(ROOT, 'world/trace');
  const names = ['land', 'river', 'mount', 'nation'];
  if (!names.every((n) => fs.existsSync(path.join(dir, `${n}.png`)))) return null;
  const { default: sharp } = await import('sharp');
  const T = {};
  for (const n of names) {
    const { data, info } = await sharp(path.join(dir, `${n}.png`)).greyscale().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 4096 || info.height !== 2048) throw new Error(`world/trace/${n}.png deve ter 4096x2048`);
    T[n] = n === 'nation' ? Uint8Array.from(data) : Float32Array.from(data, (v) => v / 255);
  }
  return T;
}
// coordenadas da geografia à mão estão na calibração antiga: convertidas para Mercator
const cvPoly = (poly) => poly.map(([lo, la]) => [lo, oldLatToMercator(la)]);
const cvLines = (list) => list.map((L) => ({ ...L, line: cvPoly(L.line) }));
const halve = (a, W, H) => { // média 2×2
  const o = new Float32Array((W / 2) * (H / 2));
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    const i = 2 * y * W + 2 * x;
    o[y * (W / 2) + x] = (a[i] + a[i + 1] + a[i + W] + a[i + W + 1]) / 4;
  }
  return o;
};

function buildInputs(places, FW, FH, T = null) {
  const LW = 4096, LH = 2048, BW = 2048, BH = 1024, TW = 1024, TH = 512;
  const landM = T ? T.land : new Float32Array(LW * LH), lakeM = new Float32Array(LW * LH);
  if (!T) {
    for (const l of G.land) fillPoly(landM, LW, LH, l.poly, 1);
    for (const l of G.lakes) fillPoly(lakeM, LW, LH, l.poly, 1);
  }
  // âncoras: garantem terra sob cada lugar terrestre do catálogo
  const anchorM = new Float32Array(LW * LH);
  for (const p of places) {
    if (!LAND_TYPES.has(p.type) || p.water) continue;
    const ring = [];
    const ar = T ? 0.35 : 1.1; // com moldes exatos, a âncora só garante o marcador em terra
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ring.push([p.lon + ar * Math.cos(a) / Math.max(0.2, Math.cos(p.lat * D2R)), p.lat + ar * Math.sin(a)]); }
    fillPoly(anchorM, LW, LH, ring, 1);
  }
  const grids = {
    land: { W: LW, H: LH, a: share(boxBlur(landM, LW, LH, T ? 1 : 9, T ? 1 : 3)) },
    lake: { W: LW, H: LH, a: share(boxBlur(lakeM, LW, LH, 3, 3)) },
    anchor: { W: LW, H: LH, a: share(boxBlur(anchorM, LW, LH, 3, 2)) },
    mount: { W: BW, H: BH, a: share(T ? boxBlur(halve(T.mount, LW, LH).map((v) => Math.min(1, v * 1.6)), BW, BH, 2, 2) : lineField(BW, BH, G.mountains)) },
    canyon: { W: BW, H: BH, a: share(lineField(BW, BH, T ? cvLines(G.canyons) : G.canyons)) },
  };
  if (T) grids.river = { W: LW, H: LH, a: share(boxBlur(T.river, LW, LH, 1, 1)) };
  for (const [k, list] of Object.entries(G.biomes)) {
    const m = new Float32Array(BW * BH);
    for (const b of list) fillPoly(m, BW, BH, T ? cvPoly(b.poly) : b.poly, 1);
    grids[k] = { W: BW, H: BH, a: share(boxBlur(m, BW, BH, 6, 3)) };
  }
  const tints = {};
  // códigos do molde de nações: 1 Terra, 2 colônias, 3 Fogo, 4 Ar, 5 Água
  const TRACE_NATION = { aang: [0, 'earth', 'fire', 'fire', 'air', 'water'], korra: [0, 'earth', 'republic', 'fire', 'air', 'water'], havens: null };
  for (const era of ERAS) {
    const idx = new Float32Array(TW * TH);
    if (T && TRACE_NATION[era]) {
      for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
        const code = T.nation[(y * 4 + 2) * LW + x * 4 + 2];
        const n = TRACE_NATION[era][code];
        if (n) idx[y * TW + x] = NATIONS.indexOf(n);
      }
    }
    for (const t of T ? [] : G.territories[era]) {
      const polys = t.poly ? [t.poly] : t.polyRef ? [G.landById(t.polyRef).poly] : t.polyRefs.map((r) => G.landById(r).poly);
      for (const p of polys) fillPoly(idx, TW, TH, p, NATIONS.indexOf(t.nation));
    }
    const ch = Array.from({ length: 5 }, () => new Float32Array(TW * TH)); // r, g, b, presença, força
    for (let i = 0; i < idx.length; i++) {
      if (!idx[i]) continue;
      const n = NATIONS[idx[i]], c = G.nationColors[n];
      ch[0][i] = c[0]; ch[1][i] = c[1]; ch[2][i] = c[2]; ch[3][i] = 1; ch[4][i] = TINT_WEIGHT[n] ?? 0.24;
    }
    tints[era] = ch.map((a) => ({ W: TW, H: TH, a: share(boxBlur(a, TW, TH, 2, 2)) }));
  }
  const segs = {};
  for (const era of ERAS) {
    const s = [];
    for (const line of T ? [] : G.borders[era] || []) for (let i = 0; i + 1 < line.length; i++) s.push(...line[i], ...line[i + 1]);
    segs[era] = s;
  }
  const zone = (era, key) => places.filter((p) => p.eras?.[era]?.[key]).map((p) => ({ lon: p.lon, lat: p.lat, r: p.eras[era][key] }));
  return {
    grids, tints, segs, warp: T ? 0 : 3,
    walls: T ? G.walls.map((w) => ({ ...w, center: [w.center[0], oldLatToMercator(w.center[1])], ry: oldLatToMercator(w.center[1] + w.ry) - oldLatToMercator(w.center[1]) })) : G.walls,
    havens: zone('havens', 'zone'), spirits: zone('korra', 'spirit'),
    F: { W: FW, H: FH, a: new Float32Array(new SharedArrayBuffer(FW * FH * 4)) },
    E: { W: FW, H: FH, a: new Float32Array(new SharedArrayBuffer(FW * FH * 4)) },
  };
}

// Amostragem bilinear (u = lon 0..1 com repetição; v = lat 0..1 de norte a sul)
function sampler({ W, H, a }) {
  return (u, v) => {
    const x = u * W - 0.5, y = Math.min(H - 1.001, Math.max(0, v * H - 0.5));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const x0 = ((ix % W) + W) % W, x1 = (x0 + 1) % W;
    const r0 = iy * W, r1 = Math.min(H - 1, iy + 1) * W;
    const top = a[r0 + x0] + (a[r0 + x1] - a[r0 + x0]) * fx;
    const bot = a[r1 + x0] + (a[r1 + x1] - a[r1 + x0]) * fx;
    return top + (bot - top) * fy;
  };
}

// ---------------------------------------------------------------------------
// Worker: campos de costa/relevo, tiles, nuvens e prévias
// ---------------------------------------------------------------------------
function makeContext(D) {
  const S = {};
  for (const [k, g] of Object.entries(D.grids)) S[k] = sampler(g);
  const C = {
    S, sF: sampler(D.F), sE: sampler(D.E), F: D.F, E: D.E,
    du: 1 / D.F.W, dv: 1 / D.F.H, dLon: 360 / D.F.W, dLat: 180 / D.F.H,
    tint: Object.fromEntries(Object.entries(D.tints).map(([e, ch]) => [e, ch.map(sampler)])),
    segs: D.segs, walls: D.walls, havens: D.havens, spirits: D.spirits, warp: D.warp ?? 3,
    rgb: new Float64Array(3),
  };
  return C;
}

function fieldsJob(C, { y0, y1 }) {
  const { W, H } = C.F, F = C.F.a, E = C.E.a, S = C.S;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5) / H, lat = 90 - v * 180;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      setP(u * 360 - 180, lat);
      // distorção de domínio (baías e penínsulas) + rugosidade só perto da costa (sem ilhas soltas no oceano)
      const wu = (C.warp * fbm(5, 4, 101)) / 360, wv = (C.warp * fbm(5, 4, 202)) / 180; // sem distorção com moldes exatos
      const lb = Math.max(S.land(u + wu, v - wv), S.anchor(u, v));
      let f = lb - 0.5 + fbm(16, 7, 11, 0.6) * (0.08 + 2.6 * lb * (1 - lb));
      const lk = S.lake(u, v) - 0.5 + 0.12 * fbm(60, 4, 77);
      if (lk > 0) f = Math.min(f, -lk * 0.6);
      const ridge = 1 - Math.abs(fbm(110, 5, 23, 0.5));
      const e = clamp01(f * 3) * 0.18 + S.mount(u, v) * (0.3 + 0.6 * ridge * ridge)
        + 0.07 * fbm(90, 4, 31) - S.canyon(u, v) * (0.3 + 0.4 * ridge);
      F[y * W + x] = f; E[y * W + x] = e;
    }
  }
}

const geoDist = (lon, lat, lon2, lat2, coslat) => {
  let dl = Math.abs(lon - lon2); if (dl > 180) dl = 360 - dl;
  return Math.hypot(dl * coslat, lat - lat2);
};

// Cor de um ponto. pxDeg = tamanho de 1 pixel de saída em graus (de latitude);
// X, Y = coordenadas em pixels de tela (padrões desenhados em escala de tela).
function shade(C, era, lon, lat, pxDeg, X, Y) {
  const { S, sF, sE, du, dv, dLon, dLat } = C;
  const u = (lon + 180) / 360, v = (90 - lat) / 180;
  const coslat = Math.max(0.05, Math.cos(lat * D2R)), alat = Math.abs(lat);
  setP(lon, lat);
  const f = sF(u, v);
  const fl = (sF(u + du, v) - sF(u - du, v)) / (2 * dLon * coslat);
  const fa = (sF(u, v - dv) - sF(u, v + dv)) / (2 * dLat);
  const dist = f / ((Math.hypot(fl, fa) + 1e-6) * pxDeg); // distância à costa em pixels (+ = terra)

  let haven = 0;
  if (era === 'havens') {
    for (const z of C.havens) {
      const d = geoDist(lon, lat, z.lon, z.lat, coslat) / z.r;
      if (d < 1.2) haven = Math.max(haven, 1 - smooth(0.6, 1.15, d));
    }
  }

  let r, g, b;
  if (f > 0) {
    // ------------------------------ TERRA ------------------------------
    const e = sE(u, v);
    const nx = -((sE(u + du, v) - sE(u - du, v)) / (2 * dLon * coslat)) * 6;
    const ny = -((sE(u, v - dv) - sE(u, v + dv)) / (2 * dLat)) * 6;
    const light = Math.max(0, (nx * -0.5 + ny * 0.5 + 0.7071) / Math.hypot(nx, ny, 1)) / 0.7071; // luz do noroeste (1 = plano)
    const moist = clamp01(0.5 + fbm(12, 4, 41) * 1.1);
    r = mix(230, 194, moist); g = mix(212, 192, moist); b = mix(164, 130, moist); // pergaminho bege, pouco verde

    const des = smooth(0.25, 0.75, S.desert(u, v) + 0.9 * fbm(20, 5, 9));
    if (des > 0) {
      const dune = 0.5 + 0.5 * Math.sin(X * 0.9 + Y * 0.35 + 6 * fbm(120, 2, 3));
      const k = des * 0.92; r = mix(r, 232 - dune * 14, k); g = mix(g, 196 - dune * 16, k); b = mix(b, 126 - dune * 12, k);
    }
    const fo = smooth(0.25, 0.8, S.forest(u, v) + 0.9 * fbm(28, 5, 13));
    if (fo > 0) {
      r = mix(r, 116, fo * 0.85); g = mix(g, 146, fo * 0.85); b = mix(b, 90, fo * 0.85);
      if (perlin3(X / 2.2, Y / 2.2, 0.5, 17) > 0.28) { const k = fo * 0.22; r *= 1 - k; g *= 1 - k * 0.6; b *= 1 - k; }
    }
    const sw = smooth(0.25, 0.8, S.swamp(u, v) + 0.8 * fbm(36, 5, 19));
    if (sw > 0) { r = mix(r, 112, sw * 0.8); g = mix(g, 130, sw * 0.8); b = mix(b, 98, sw * 0.8); }
    const fa2 = smooth(0.45, 0.8, S.farmland(u, v));
    if (fa2 > 0) {
      const grid = (X % 7 < 0.9 || Y % 7 < 0.9) ? 0.86 : 1;
      r = mix(r, 208 * grid, fa2 * 0.5); g = mix(g, 198 * grid, fa2 * 0.5); b = mix(b, 124 * grid, fa2 * 0.5);
    }
    const mt = smooth(0.18, 0.7, e);
    r = mix(r, 156, mt * 0.75); g = mix(g, 128, mt * 0.75); b = mix(b, 96, mt * 0.75);
    // neve por latitude: com os moldes oficiais, as terras polares (Tribos da Água) ficam azul-gelo, como no mapa oficial
    const snow = clamp01(smooth(0.8, 1.0, e) * 0.85 + (C.warp ? smooth(62, 70, alat + 4 * fbm(40, 3, 29)) : 0.25 * smooth(60, 70, alat)));
    r = mix(r, 240, snow); g = mix(g, 243, snow); b = mix(b, 245, snow);
    const sh = mix(1, Math.max(0.55, Math.min(1.25, light)), 0.55 + mt * 0.45);
    r *= sh; g *= sh; b *= sh;

    // tinta das nações e fronteiras
    const T = C.tint[era], ta = T[3](u, v);
    if (ta > 0.01) {
      const k = T[4](u, v) * (1 - snow * 0.6);
      r = mix(r, T[0](u, v) / ta, k); g = mix(g, T[1](u, v) / ta, k); b = mix(b, T[2](u, v) / ta, k);
    }
    if (S.river) { // rios do mapa oficial
      const rv = S.river(u, v);
      if (rv > 0.28) { const k = smooth(0.28, 0.7, rv) * (era === 'havens' ? 0.45 : 0.85); r = mix(r, 88, k); g = mix(g, 134, k); b = mix(b, 164, k); }
    }
    const sg = C.segs[era];
    if (sg.length) {
      let dmin = Infinity;
      for (let k = 0; k < sg.length; k += 4) {
        const ax = sg[k], ay = sg[k + 1], bx = sg[k + 2], by = sg[k + 3];
        const dx = (bx - ax) * coslat, dy = by - ay, px = (lon - ax) * coslat, py = lat - ay;
        const t = clamp01((px * dx + py * dy) / (dx * dx + dy * dy || 1));
        dmin = Math.min(dmin, Math.hypot(px - t * dx, py - t * dy));
      }
      const dpx = dmin / pxDeg;
      if (dpx < 1.6 && Math.sin((X + Y) * 0.6) > -0.25) {
        const k = (1 - smooth(0.5, 1.6, dpx)) * 0.7;
        r = mix(r, 96, k); g = mix(g, 54, k); b = mix(b, 40, k);
      }
    }
    for (const w of C.walls) { // muralhas de Ba Sing Se
      const rho = Math.hypot((lon - w.center[0]) / w.rx, (lat - w.center[1]) / w.ry);
      const dpx = Math.abs(rho - 1) * Math.min(w.rx * coslat, w.ry) / pxDeg;
      if (dpx < 1.5) { const k = (1 - smooth(0.4, 1.5, dpx)) * (era === 'havens' ? 0.45 : 0.7); r = mix(r, 92, k); g = mix(g, 70, k); b = mix(b, 52, k); }
    }

    if (era === 'korra') { // vinhas espirituais
      for (const z of C.spirits) {
        const d = geoDist(lon, lat, z.lon, z.lat, coslat) / z.r;
        if (d < 1.4) {
          const k = (1 - smooth(0.4, 1.4, d)) * smooth(0.82, 0.95, 1 - Math.abs(fbm(900, 3, 61)));
          r = mix(r, 70, k); g = mix(g, 150, k); b = mix(b, 124, k);
        }
      }
    }
    if (era === 'havens') { // Terras Duras: sem cor e rachadas; vida só nos refúgios
      const dead = 1 - haven, lum = 0.3 * r + 0.59 * g + 0.11 * b;
      r = mix(r, lum * 1.08 + 18, 0.7 * dead); g = mix(g, lum * 0.95 + 6, 0.7 * dead); b = mix(b, lum * 0.78, 0.7 * dead);
      const crack = 1 - Math.abs(fbm(150, 4, 71, 0.6));
      if (crack > 0.965) { const k = smooth(0.965, 0.995, crack) * 0.45 * dead; r *= 1 - k; g *= 1 - k; b *= 1 - k; }
    }
  } else {
    // ------------------------------ ÁGUA ------------------------------
    const depth = clamp01(-f * 3.2);
    r = mix(158, 84, depth); g = mix(198, 134, depth); b = mix(196, 166, depth);
    const swirl = fbm(30, 4, 53);
    r += swirl * 10; g += swirl * 11; b += swirl * 9;
    const wv = Math.sin((Y / 7 + 2.5 * perlin3(X / 40, Y / 40, 3.1, 57)) * Math.PI * 2);
    if (wv > 0.94 && perlin3(X / 11, Y / 11, 9.7, 59) > 0.22) {
      const k = 0.5 * smooth(0.94, 1, wv); r -= 26 * k; g -= 20 * k; b -= 14 * k;
    }
    for (const [t, a] of RIPPLES) {
      const w = Math.abs(-dist - t);
      if (w < 1.2) { const k = a * (1 - w / 1.2); r = mix(r, 64, k); g = mix(g, 98, k); b = mix(b, 116, k); }
    }
    // gelo marinho só perto dos polos verdadeiros (no mapa oficial em Mercator as terras polares ficam por volta de 65–75°)
    const ice = C.warp ? smooth(62, 72, alat + 5 * fbm(120, 3, 37)) : smooth(85, 89, alat + 2 * fbm(120, 3, 37));
    r = mix(r, 214, ice * 0.7); g = mix(g, 230, ice * 0.7); b = mix(b, 236, ice * 0.7);
    if (era === 'havens') {
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      r = mix(r, lum * 0.82, 0.55); g = mix(g, lum * 0.92, 0.55); b = mix(b, lum * 0.98, 0.55);
    }
  }

  // contorno da costa a nanquim
  const ink = 1 - smooth(0.5, 1.4, Math.abs(dist));
  if (ink > 0) { r = mix(r, 74, ink * 0.85); g = mix(g, 56, ink * 0.85); b = mix(b, 42, ink * 0.85); }
  if (haven > 0) { // anel dourado dos refúgios
    const ring = haven * (1 - haven) * 4;
    r = mix(r, 236, ring * 0.35); g = mix(g, 196, ring * 0.35); b = mix(b, 92, ring * 0.35);
  }
  // papel: grão fino + manchas largas
  const paper = (0.955 + 0.045 * perlin3(X / 1.4, Y / 1.4, 7.3, 5)) * (0.975 + 0.035 * fbm(6, 3, 91));
  C.rgb[0] = r * paper; C.rgb[1] = g * paper; C.rgb[2] = b * paper;
}

async function tileJob(C, sharp, { era, z, x, y, out }) {
  const W = 256 * 2 ** z, ss = z <= 3 ? 2 : 1, buf = Buffer.allocUnsafe(256 * 256 * 3);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const X = x * 256 + i + (sx + 0.5) / ss, Y = y * 256 + j + (sy + 0.5) / ss;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * Y) / W))) / D2R;
      shade(C, era, (X / W) * 360 - 180, lat, (360 / W) * Math.cos(lat * D2R), X, Y);
      r += C.rgb[0]; g += C.rgb[1]; b += C.rgb[2];
    }
    const o = (j * 256 + i) * 3, k = 1 / (ss * ss);
    buf[o] = byte(r * k); buf[o + 1] = byte(g * k); buf[o + 2] = byte(b * k);
  }
  const file = path.join(out, 'tiles', era, String(z), String(x), `${y}.webp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(buf, { raw: { width: 256, height: 256, channels: 3 } }).webp({ quality: 80, effort: 4 }).toFile(file);
}

async function cloudJob(C, sharp, { set, z, x, y, out }) {
  const W = 256 * 2 ** z, buf = Buffer.alloc(256 * 256 * 4);
  const storm = set === 'storms', tint = storm ? [172, 150, 206] : [255, 255, 255]; // tempestades violáceas, como na arte oficial de Sete Refúgios
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const X = x * 256 + i + 0.5, Y = y * 256 + j + 0.5;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * Y) / W))) / D2R;
    setP((X / W) * 360 - 180 + 8 * Math.sin(lat * 3 * D2R), lat); // bandas de vento
    const c = fbm(storm ? 7 : 9, 6, storm ? 977 : 501, storm ? 0.6 : 0.55);
    const a = storm ? smooth(-0.05, 0.45, c + 0.5 * fbm(3, 3, 999)) * 0.72 : smooth(0.15, 0.5, c) * 0.6;
    const o = (j * 256 + i) * 4;
    buf[o] = tint[0]; buf[o + 1] = tint[1]; buf[o + 2] = tint[2]; buf[o + 3] = byte(a * 255);
  }
  const file = path.join(out, 'overlays', set, String(z), String(x), `${y}.webp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(buf, { raw: { width: 256, height: 256, channels: 4 } }).webp({ quality: 70, alphaQuality: 70, effort: 4 }).toFile(file);
}

async function previewJob(C, sharp, { era, out }) {
  const W = 2048, H = 1024, buf = Buffer.allocUnsafe(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    shade(C, era, ((x + 0.5) / W) * 360 - 180, 90 - ((y + 0.5) / H) * 180, 180 / H, x, y);
    const o = (y * W + x) * 3;
    buf[o] = byte(C.rgb[0]); buf[o + 1] = byte(C.rgb[1]); buf[o + 2] = byte(C.rgb[2]);
  }
  const file = path.join(out, 'previews', `${era}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
}

async function workerMain() {
  const C = makeContext(workerData);
  let sharp = null;
  if (workerData.needSharp) {
    sharp = (await import('sharp')).default;
    sharp.concurrency(1);
    sharp.cache(false);
  }
  parentPort.on('message', async (job) => {
    try {
      if (job.kind === 'fields') fieldsJob(C, job);
      else if (job.kind === 'tile') await tileJob(C, sharp, job);
      else if (job.kind === 'cloud') await cloudJob(C, sharp, job);
      else if (job.kind === 'preview') await previewJob(C, sharp, job);
      parentPort.postMessage({ done: true });
    } catch (e) {
      parentPort.postMessage({ error: String((e && e.stack) || e) });
    }
  });
  parentPort.postMessage({ ready: true });
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------
function runJobs(jobs, data, label) {
  return new Promise((resolve, reject) => {
    const total = jobs.length, t0 = Date.now();
    if (!total) return resolve();
    const n = Math.max(1, Math.min(os.cpus().length, total));
    const workers = [];
    let next = 0, finished = 0, step = 0, stopped = false;
    const stop = () => { stopped = true; for (const w of workers) w.terminate(); };
    for (let i = 0; i < n; i++) {
      const w = new Worker(__filename, { workerData: data });
      workers.push(w);
      w.on('message', (m) => {
        if (stopped) return;
        if (m.error) { stop(); reject(new Error(m.error)); return; }
        if (m.done) {
          finished++;
          const s = Math.floor((finished / total) * 10);
          if (s > step) { step = s; console.log(`  ${label}: ${s * 10}%`); }
          if (finished === total) {
            stop();
            console.log(`  ${label}: concluído em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
            resolve();
            return;
          }
        }
        if (next < total) w.postMessage(jobs[next++]);
      });
      w.on('error', (e) => { if (!stopped) { stop(); reject(e); } });
    }
  });
}

function landCheck(inputs, places) {
  const sF = sampler(inputs.F);
  const bad = places.filter((p) => LAND_TYPES.has(p.type) && !p.water && sF((p.lon + 180) / 360, (90 - p.lat) / 180) < 0.03);
  if (bad.length) {
    console.warn('AVISO: lugares que caíram na água ou colados na costa (ajuste lon/lat ou a geografia):');
    for (const p of bad) console.warn(`  - ${p.id} (${p.lon}, ${p.lat})`);
  } else console.log('Conferência: todos os lugares terrestres estão em terra.');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const maxZoom = Number(opt('max-zoom', 6));
  const FW = Number(opt('field', 8192)), FH = FW / 2;
  const eras = opt('era', 'all') === 'all' ? ERAS : opt('era').split(',');
  const out = path.resolve(ROOT, opt('out', 'public'));
  if (!(maxZoom >= 0 && maxZoom <= 8) || eras.some((e) => !ERAS.includes(e))) throw new Error('Parâmetros inválidos');

  const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/places.json'), 'utf8')).places;
  console.log(`Mundo Avatar — zoom 0–${maxZoom}, campos ${FW}x${FH}, eras: ${eras.join(', ')}`);
  const trace = await loadTrace();
  console.log(trace ? 'Usando os moldes do mapa oficial (world/trace).' : 'Sem moldes: usando a geografia desenhada à mão.');
  const inputs = buildInputs(places, FW, FH, trace);

  const rows = [];
  for (let y = 0; y < FH; y += 16) rows.push({ kind: 'fields', y0: y, y1: Math.min(FH, y + 16) });
  await runJobs(rows, { ...inputs, needSharp: false }, 'costa e relevo');
  landCheck(inputs, places);

  const jobs = [];
  for (const era of eras) {
    fs.rmSync(path.join(out, 'tiles', era), { recursive: true, force: true });
    jobs.push({ kind: 'preview', era, out });
    for (let z = 0; z <= maxZoom; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) jobs.push({ kind: 'tile', era, z, x, y, out });
  }
  const sets = new Set(eras.map((e) => (e === 'havens' ? 'storms' : 'clouds')));
  for (const set of sets) {
    fs.rmSync(path.join(out, 'overlays', set), { recursive: true, force: true });
    for (let z = 0; z <= 2; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) jobs.push({ kind: 'cloud', set, z, x, y, out });
  }
  await runJobs(jobs, { ...inputs, needSharp: true }, `tiles (${jobs.length})`);

  const metaFile = path.join(out, 'tiles', 'meta.json');
  const prev = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const meta = { ...prev, maxzoom: maxZoom, overlaysMaxzoom: 2, generated: new Date().toISOString() };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  console.log(`Pronto. Memória máxima usada: ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();
