#!/usr/bin/env node
// Lê o mapa-múndi oficial (arte/referencia/mapa-oficial.jpeg, fora do git) e
// extrai, pixel a pixel, os MOLDES usados pela pintura nova:
//   world/trace/land.png    terra (contornos exatos do mapa oficial)
//   world/trace/nation.png  nação de cada terra (pela cor do mapa oficial)
//   world/trace/river.png   rios (traços escuros longos dentro da terra)
//   world/trace/mount.png   montanhas (densidade dos traços de relevo)
// Saída em projeção equirretangular 4096×2048 (lon −180..180, lat 90..−90),
// convertida da imagem pela projeção de Mercator (world/projection.mjs).
// Nada da arte oficial é copiado: só as formas viram máscaras.
//
//   node tools/trace-official.mjs [--debug]

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMG_W, IMG_H, lonLatToImage } from '../world/projection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'arte/referencia/mapa-oficial.jpeg');
const OUT = path.join(ROOT, 'world/trace');
const DEBUG = process.argv.includes('--debug');
const OW = 4096, OH = 2048;

// Elementos decorativos do mapa oficial que não são terra (em px da imagem 3840×2160)
const EXCLUDE = [
  [1305, 335, 1710, 595], // quadro de detalhe (zoom das colônias)
  [665, 290, 1075, 730], [665, 1430, 1075, 1855], // medalhões da Água e do Fogo
  [2750, 290, 3160, 730], [2750, 1430, 3160, 1855], // medalhões da Terra e do Ar
  [1585, 60, 2255, 250], [1585, 1905, 2255, 2105], // placas com os títulos
  [0, 0, 600, IMG_H], [3240, 0, IMG_W, IMG_H], [0, 0, IMG_W, 250], [0, 1880, IMG_W, IMG_H], // moldura
  [3040, 1400, 3240, 2000], // resto da moldura no canto inferior direito
];
// "Cone" translúcido que liga o quadro de detalhe ao continente (triângulo)
const CONE = [[1300, 585], [1715, 585], [1800, 812]];
const inTri = (x, y, [a, b, c], pad = 0) => {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const d1 = side(a, b) / len(a, b), d2 = side(b, c) / len(b, c), d3 = side(c, a) / len(c, a);
  const neg = d1 < pad && d2 < pad && d3 < pad, pos = d1 > -pad && d2 > -pad && d3 > -pad;
  return neg || pos;
};
// Fumaça dos vulcões: nessas caixas, o que for branco/cinza é céu, não terra
const SMOKE = [[1070, 785, 1210, 948], [1205, 845, 1310, 962], [1465, 900, 1585, 1040]];
// Ba Sing Se: os anéis escuros são as muralhas, não rios
const BSS = { x: 2380, y: 760, r: 190 };
// Região das colônias do Fogo (terra marrom no canto noroeste do Grande Continente)
const COLONIES = [1480, 540, 2000, 1000];

const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// ---- morfologia binária com imagem integral (janela quadrada)
function integral(m, W, H) {
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += m[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
    }
  }
  return I;
}
function windowSum(I, W, H, x, y, r) {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
  const W1 = W + 1;
  return { s: I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0], n: (x1 - x0) * (y1 - y0) };
}
function dilate(m, W, H, r) {
  const I = integral(m, W, H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = windowSum(I, W, H, x, y, r).s > 0 ? 1 : 0;
  return o;
}
function erode(m, W, H, r) {
  const I = integral(m, W, H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const w = windowSum(I, W, H, x, y, r); o[y * W + x] = w.s === w.n ? 1 : 0; }
  return o;
}
const open = (m, W, H, r) => dilate(erode(m, W, H, r), W, H, r);
const close = (m, W, H, r) => erode(dilate(m, W, H, r), W, H, r);
function boxBlurF(m, W, H, r) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += m[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const w = windowSum(I, W, H, x, y, r); o[y * W + x] = w.s / w.n; }
  return o;
}
/** Remove componentes conexos menores que minArea (ruído). */
function dropSmall(m, W, H, minArea) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || seen[i]) continue;
    let top = 0, n = 0; const comp = [];
    stack[top++] = i; seen[i] = 1;
    while (top) {
      const j = stack[--top]; comp.push(j); n++;
      const x = j % W, y = (j / W) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) {
        if (k >= 0 && m[k] && !seen[k]) { seen[k] = 1; stack[top++] = k; }
      }
    }
    if (n < minArea) for (const j of comp) m[j] = 0;
  }
  return m;
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Falta a imagem oficial em ${SRC} (veja docs/ARTE-OFICIAL.md)`);
  const { data, info } = await sharp(SRC).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (info.width !== IMG_W || info.height !== IMG_H) throw new Error(`Esperava ${IMG_W}×${IMG_H}, veio ${info.width}×${info.height}`);
  const W = IMG_W, H = IMG_H, N = W * H;
  console.log('classificando cores…');
  // classes de cor: 0 mar, 1 bege (Terra), 2 marrom (colônias), 3 laranja (Fogo), 4 branco (Ar), 5 azul-gelo (Água), 9 traço escuro
  const cls = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let c;
    if (b - r > 12 && r < 140) c = 0;
    else if (mx < 95) c = 9;
    else if (r - b > 70 && r > 150 && g < 150) c = 3;
    else if (b - r > 8) c = 5;
    else if (mx - mn <= 25 && mx >= 130) c = 4;
    else if (r - b > 25 && mx < 175) c = 2;
    else if (r - b > 25) c = 1;
    else c = 9;
    if (EXCLUDE.some((bx) => inBox(x, y, bx))) c = 0;
    // sob o cone: tons azulados/acinzentados são mar clareado; bege e marrom continuam terra
    // sob o cone translúcido: linhas escuras = indefinido (decide pela vizinhança);
    // tom azulado = mar clareado; tom quente = terra clareada (nação vem dos vizinhos)
    else if (inTri(x, y, CONE, 12)) c = mx < 115 ? 7 : 6; // 6 = decidido abaixo (2 grupos de cor)
    else if ((c === 4 || c === 5) && SMOKE.some((bx) => inBox(x, y, bx))) c = 0;
    cls[i] = c;
  }

  { // sob o cone: separa os tons clareados em 3 grupos de cor (k-médias: mar, terra
    // marrom e terra bege); o grupo mais azulado em relação ao vermelho é o mar
    const idx = [];
    for (let i = 0; i < N; i++) if (cls[i] === 6) idx.push(i);
    let C = [[110, 110, 140], [150, 130, 110], [210, 190, 150]];
    const near = (i) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < C.length; k++) {
        const d = (data[i * 3] - C[k][0]) ** 2 + (data[i * 3 + 1] - C[k][1]) ** 2 + (data[i * 3 + 2] - C[k][2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    for (let it = 0; it < 15; it++) {
      const sum = C.map(() => [0, 0, 0, 0]);
      for (const i of idx) { const t = sum[near(i)]; t[0] += data[i * 3]; t[1] += data[i * 3 + 1]; t[2] += data[i * 3 + 2]; t[3]++; }
      C = C.map((c, k) => (sum[k][3] ? sum[k].slice(0, 3).map((v) => v / sum[k][3]) : c));
    }
    const sea = C.map((c) => c[2] - c[0]).reduce((bi, v, k, arr) => (v > arr[bi] ? k : bi), 0);
    console.log('  cone: grupos', C.map((c) => c.map(Math.round).join('/')).join('  '), '→ mar = grupo', sea);
    for (const i of idx) cls[i] = near(i) === sea ? 0 : 8;
  }

  console.log('limpando a máscara de terra…');
  let land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = cls[i] !== 0 && cls[i] !== 7 ? 1 : 0;
  { // pixels indefinidos (linhas do cone) seguem a maioria dos vizinhos conhecidos
    const known = new Uint8Array(N);
    for (let i = 0; i < N; i++) known[i] = cls[i] !== 7 ? 1 : 0;
    const fracLand = boxBlurF(land, W, H, 14), fracKnown = boxBlurF(known, W, H, 14);
    for (let i = 0; i < N; i++) if (cls[i] === 7) land[i] = fracKnown[i] > 0 && fracLand[i] / fracKnown[i] > 0.5 ? 1 : 0;
  }
  land = open(land, W, H, 4); // some com as linhas finas sobre o mar (quadro de detalhe)
  land = close(land, W, H, 2); // fecha poros
  { // onde o cone escondia o litoral, suaviza o contorno (maioria numa janela de 8 px)
    const soft = boxBlurF(land, W, H, 8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inTri(x, y, CONE, 30)) land[y * W + x] = soft[y * W + x] > 0.5 ? 1 : 0;
  }
  land = dropSmall(land, W, H, 60);
  const water = new Uint8Array(N);
  for (let i = 0; i < N; i++) water[i] = land[i] ? 0 : 1;
  dropSmall(water, W, H, 60); // furinhos de "mar" dentro da terra viram terra
  for (let i = 0; i < N; i++) if (!land[i] && !water[i]) land[i] = 1;

  console.log('rios e montanhas…');
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) dark[i] = cls[i] === 9 && land[i] ? 1 : 0;
  const coastNear = dilate(water, W, H, 9); // contorno do litoral não é rio
  let thick = open(dark, W, H, 2); // traços grossos (rios); os finos (relevo) somem
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (coastNear[i] || (x - BSS.x) ** 2 + (y - BSS.y) ** 2 < BSS.r ** 2 || inTri(x, y, CONE, 18)) thick[i] = 0;
  }
  thick = dropSmall(thick, W, H, 150); // rio é traço longo
  const hatch = new Uint8Array(N);
  for (let i = 0; i < N; i++) hatch[i] = dark[i] && !thick[i] && !coastNear[i] && !inTri(i % W, (i / W) | 0, CONE, 18) ? 1 : 0;
  const mountD = boxBlurF(hatch, W, H, 14);

  console.log('nações…');
  const classMaps = [1, 2, 3, 4, 5].map((k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = cls[i] === k ? 1 : 0; return boxBlurF(m, W, H, 10); });
  let nation = new Uint8Array(N); // 1 Terra, 2 colônias, 3 Fogo, 4 Ar, 5 Água
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    let best = 0, bv = 0;
    for (let k = 0; k < 5; k++) if (classMaps[k][i] > bv) { bv = classMaps[k][i]; best = k + 1; }
    // marrom fora da região das colônias é sombra/contorno (ex.: muralhas de Ba Sing Se): é Terra
    if (best === 2 && !inBox(i % W, (i / W) | 0, COLONIES)) best = 1;
    nation[i] = best || 1;
  }
  // filtro de moda: manchas pequenas (pontas claras dos vulcões etc.) assumem a nação ao redor
  const modeMaps = [1, 2, 3, 4, 5].map((k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = nation[i] === k ? 1 : 0; return boxBlurF(m, W, H, 22); });
  const smooth = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    let best = nation[i], bv = 0;
    for (let k = 0; k < 5; k++) if (modeMaps[k][i] > bv) { bv = modeMaps[k][i]; best = k + 1; }
    smooth[i] = best;
  }
  nation = smooth;

  console.log('projetando para o globo (Mercator → esfera)…');
  fs.mkdirSync(OUT, { recursive: true });
  const oLand = Buffer.alloc(OW * OH), oRiver = Buffer.alloc(OW * OH), oMount = Buffer.alloc(OW * OH), oNation = Buffer.alloc(OW * OH);
  const SS = 3; // supersampling 3×3 para bordas suaves e exatas
  for (let v = 0; v < OH; v++) {
    for (let u = 0; u < OW; u++) {
      let l = 0, rv = 0, mt = 0; const votes = [0, 0, 0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const lon = ((u + (sx + 0.5) / SS) / OW) * 360 - 180;
        const lat = 90 - ((v + (sy + 0.5) / SS) / OH) * 180;
        if (Math.abs(lat) > 89.5) continue;
        const [x, y] = lonLatToImage(lon, lat);
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix;
        if (land[i]) { l++; votes[nation[i]]++; }
        if (thick[i]) rv++;
        mt += mountD[i];
      }
      const o = v * OW + u, n = SS * SS;
      oLand[o] = Math.round((255 * l) / n);
      oRiver[o] = Math.round((255 * rv) / n);
      oMount[o] = Math.min(255, Math.round((255 * mt) / n / 0.35));
      oNation[o] = votes.indexOf(Math.max(...votes)) * (l ? 1 : 0);
    }
  }
  const save = (buf, name) => sharp(buf, { raw: { width: OW, height: OH, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  await Promise.all([save(oLand, 'land.png'), save(oRiver, 'river.png'), save(oMount, 'mount.png'), save(oNation, 'nation.png')]);

  if (DEBUG) {
    const pal = [[30, 50, 110], [225, 205, 155], [150, 120, 85], [215, 110, 60], [235, 235, 230], [170, 200, 225]];
    const dbg = Buffer.alloc(W * H * 3);
    for (let i = 0; i < N; i++) {
      const c = thick[i] ? [20, 90, 220] : hatch[i] ? [90, 70, 50] : pal[land[i] ? nation[i] : 0];
      dbg.set(c, i * 3);
    }
    await sharp(dbg, { raw: { width: W, height: H, channels: 3 } }).resize(1920).png().toFile(path.join(OUT, '..', '..', 'arte', 'referencia', 'debug-traco.png'));
    const eq = Buffer.alloc(OW * OH * 3);
    for (let o = 0; o < OW * OH; o++) eq.set(oRiver[o] > 100 ? [20, 90, 220] : pal[oLand[o] > 127 ? oNation[o] : 0], o * 3);
    await sharp(eq, { raw: { width: OW, height: OH, channels: 3 } }).resize(2048).png().toFile(path.join(ROOT, 'arte', 'referencia', 'debug-globo.png'));
  }
  console.log(`pronto: ${path.relative(ROOT, OUT)}/{land,nation,river,mount}.png`);
}

main().catch((e) => { console.error(e); process.exit(1); });
