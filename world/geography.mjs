// Geografia base do Mundo Avatar, em graus [longitude, latitude].
//
// Convenção: o mapa-múndi oficial da série é tratado como uma projeção
// equirretangular (x -> longitude -180..180, y -> latitude 90..-90).
// Todas as formas aqui são APROXIMADAS a partir do mapa oficial de ATLA/LoK
// e de descrições do wiki/episódios. Use o "Modo editor" e a "Sobreposição de
// calibração" no app para ajustar com a arte oficial e depois regenere a textura.
//
// Este arquivo é compartilhado pelo gerador de textura (tools/render-world.mjs)
// e pelo app (rótulos de regiões).

// ---------------------------------------------------------------------------
// Massas de terra
// ---------------------------------------------------------------------------
export const land = [
  {
    id: 'grande-continente',
    name: 'Reino da Terra (Grande Continente)',
    poly: [
      [-52, 30], [-56, 38], [-52, 46], [-46, 46], [-44, 42], [-40, 40.2], [-35.5, 42.5],
      [-36, 49], [-30, 54], [-20, 58], [-8, 60], [5, 63], [18, 61], [28, 57],
      [38, 58], [50, 55], [62, 52], [75, 50], [88, 47], [100, 44], [112, 40],
      [124, 36], [135, 30], [142, 22], [147, 12], [150, 3], [146, -6], [138, -10],
      [131, -6], [123, -12], [116, -20], [110, -25], [104, -21], [99, -29],
      [92, -36], [84, -38], [76, -34], [70, -28], [65, -20], [61, -8], [57, 3],
      [53, -4], [50, -16], [46, -24], [40, -30], [32, -34], [22, -36], [12, -34],
      [4, -36], [-6, -32], [-14, -30], [-22, -26], [-28, -20], [-34, -14],
      [-40, -8], [-44, -2], [-48, 6], [-52, 14], [-50, 22],
    ],
  },
  // Nação do Fogo: arquipélago vulcânico em forma de crescente, a oeste
  {
    id: 'ilha-principal-fogo',
    name: 'Ilha principal da Nação do Fogo',
    poly: [
      [-112, 26], [-104, 30], [-96, 28], [-92, 22], [-94, 16], [-98, 12], [-96, 6],
      [-92, 2], [-90, -4], [-93, -12], [-100, -18], [-108, -20], [-112, -14],
      [-109, -6], [-111, 2], [-116, 8], [-118, 16], [-116, 22],
    ],
  },
  { id: 'ilha-ember', name: 'Ilha Ember', poly: circle(-87, 22, 3.2, 3.0, 11) },
  { id: 'ilha-crescente', name: 'Ilha Crescente', poly: [[-126, 10], [-121, 8], [-120, 2], [-122, -3], [-125, 0], [-123, 4]] },
  { id: 'ilha-roku', name: 'Ilha de Roku', poly: circle(-131, -14, 3.0, 2.6, 9) },
  { id: 'ilha-rocha-fervente', name: 'Rocha Fervente', poly: circle(-121, 33, 2.4, 2.2, 9) },
  { id: 'ilhas-sul-fogo', name: 'Ilhas do sul', poly: circle(-83, -14, 2.6, 2.2, 9) },
  { id: 'ilha-shu-jing', name: 'Shu Jing', poly: circle(-80, 6, 2.2, 2.0, 9) },
  { id: 'ilhas-oeste-fogo', name: 'Ilhas ocidentais', poly: circle(-138, 12, 2.4, 2.0, 9) },
  // Terra do Templo do Ar do Oeste, ao norte da Nação do Fogo
  {
    id: 'terra-templo-oeste',
    name: 'Penhascos do Templo do Ar do Oeste',
    poly: [[-109, 40], [-104, 46], [-97, 49], [-89, 46], [-86, 41], [-92, 37], [-100, 37]],
  },
  // Ilhas do sul do Reino da Terra
  { id: 'ilha-templo-ar', name: 'Ilha do Templo do Ar', poly: circle(-40.5, 43.9, 1.3, 1.0, 9) },
  { id: 'ilha-kyoshi', name: 'Ilha Kyoshi', poly: circle(-7, -43, 3.4, 2.6, 11) },
  {
    id: 'ilha-patola',
    name: 'Cordilheira Patola',
    poly: [[-38, -46], [-31, -44], [-24, -47], [-22, -52], [-29, -55], [-36, -53]],
  },
  { id: 'ilha-rabo-de-baleia', name: 'Ilha Rabo-de-Baleia', poly: [[-60, -56], [-54, -53], [-49, -56], [-52, -60], [-58, -60]] },
  { id: 'ilha-lua-crescente', name: 'Ilhas do leste', poly: circle(158, 10, 3.0, 2.6, 9) },
  { id: 'ilhas-orientais-2', name: 'Ilhas do leste 2', poly: circle(156, -4, 2.2, 1.8, 9) },
  // Polo Norte (Tribo da Água do Norte)
  {
    id: 'polo-norte',
    name: 'Polo Norte',
    poly: [
      [-180, 90], [180, 90], [180, 76], [150, 77], [120, 75], [90, 77], [60, 75],
      [30, 77], [5, 75], [-6, 72], [-12, 68.5], [-20, 67.5], [-28, 69], [-34, 73],
      [-60, 76], [-90, 75], [-120, 77], [-150, 76], [-180, 76],
    ],
  },
  // Polo Sul (Tribo da Água do Sul)
  {
    id: 'polo-sul',
    name: 'Polo Sul',
    poly: [
      [-180, -90], [-180, -74], [-150, -73], [-120, -75], [-90, -72], [-60, -71],
      [-30, -70], [-10, -67], [0, -65.5], [10, -66], [20, -69], [45, -71],
      [80, -73], [110, -71], [150, -74], [180, -74], [180, -90],
    ],
  },
];

// Lagos (água doce dentro dos continentes)
export const lakes = [
  { id: 'lago-laogai', name: 'Lago Laogai', poly: circle(66, 29, 1.0, 0.7, 9) },
  { id: 'lago-oriental', name: 'Lago Oriental', poly: circle(63.5, 11.5, 3.6, 2.4, 11) },
  { id: 'lago-rocha-fervente', name: 'Lago fervente', poly: circle(-121, 33, 1.0, 0.9, 7) },
];

// ---------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------
// Cordilheiras: polylines com largura (graus) e altura relativa (0..1)
export const mountains = [
  { name: 'Montanhas do Norte', line: [[-6, 52], [4, 56], [15, 58], [26, 54]], width: 5, height: 1.0 },
  { name: 'Montanhas de Omashu', line: [[-32, 22], [-27, 12], [-23, 2], [-21, -8]], width: 4, height: 0.85 },
  { name: 'Serra central', line: [[38, 27], [42, 16], [44, 5]], width: 4, height: 0.7 },
  { name: 'Montanhas de Ba Sing Se', line: [[70, 40], [80, 34], [86, 24]], width: 4, height: 0.75 },
  { name: 'Montanhas do Leste', line: [[118, 22], [127, 13], [133, 4], [137, -4]], width: 5, height: 1.0 },
  { name: 'Cânions do Sudeste', line: [[82, -24], [90, -30], [98, -25]], width: 4, height: 0.6 },
  { name: 'Espinha vulcânica do norte', line: [[-110, 22], [-106, 13], [-106.5, 7]], width: 3.5, height: 0.9 },
  { name: 'Espinha vulcânica do sul', line: [[-99, 0], [-100, -6], [-102, -14]], width: 3.5, height: 0.85 },
  { name: 'Caldeira da Capital', line: ring(-102.5, 4.5, 1.7, 1.4, 16), width: 0.8, height: 0.7 },
  { name: 'Cordilheira Patola', line: [[-35, -49], [-28, -51]], width: 3, height: 0.9 },
  { name: 'Penhascos do Oeste', line: [[-104, 44], [-93, 43]], width: 3, height: 0.8 },
  { name: 'Montanhas do sul', line: [[2, -24], [12, -28], [24, -27]], width: 3.5, height: 0.55 },
  { name: 'Cordilheira do noroeste', line: [[-30, 50], [-20, 50], [-12, 46]], width: 3, height: 0.6 },
  { name: 'Geleiras do sul', line: [[-40, -78], [-10, -76], [30, -79]], width: 6, height: 0.8 },
  { name: 'Geleiras do norte', line: [[-40, 81], [0, 79], [40, 82]], width: 6, height: 0.7 },
];

// Cânions (relevo negativo)
export const canyons = [
  { name: 'A Grande Divisão', line: [[1, 30], [6, 26], [9, 22]], width: 1.2, depth: 0.8 },
  { name: 'Cânions de Ellora', line: [[85.5, -26.5], [88, -28.5], [90, -29.6], [92.5, -29], [95, -27.5]], width: 0.45, depth: 0.55 },
];

// ---------------------------------------------------------------------------
// Biomas
// ---------------------------------------------------------------------------
export const biomes = {
  desert: [
    { name: 'Deserto de Si Wong', poly: [[0, 22], [12, 31], [30, 29], [38, 19], [35, 6], [20, 1], [6, 5], [-2, 13]] },
    { name: 'Ermos do Sudeste', poly: [[78, -26], [88, -22], [100, -24], [96, -33], [84, -35]] },
  ],
  forest: [
    { name: 'Floresta de Senlin', poly: circle(-37, 20, 6, 5, 10) },
    { name: 'Floresta Wulong', poly: circle(42, -8, 5, 4, 10) },
    { name: 'Florestas do Leste', poly: [[95, 30], [110, 34], [122, 24], [112, 10], [98, 14]] },
    { name: 'Florestas do Norte', poly: [[30, 50], [50, 52], [62, 46], [48, 40], [32, 42]] },
    { name: 'Selva do Fogo', poly: [[-100, -8], [-94, -10], [-96, -16], [-104, -16]] },
    { name: 'Bosques do sul', poly: [[-30, -18], [-22, -20], [-20, -26], [-30, -24]] },
  ],
  swamp: [
    { name: 'Pântano Nebuloso', poly: circle(-15, -17, 5.5, 4.5, 11) },
  ],
  farmland: [
    { name: 'Anel Agrário de Ba Sing Se', poly: circle(63, 30, 8.5, 6.8, 16) },
  ],
};

// Muralhas de Ba Sing Se (desenhadas como anéis no mapa)
export const walls = [
  { name: 'Muralha Externa', center: [63, 30], rx: 8.5, ry: 6.8 },
  { name: 'Muralha Interna', center: [63, 30], rx: 3.4, ry: 2.6 },
];

// ---------------------------------------------------------------------------
// Territórios por era (tinta suave sobre o mapa)
// ---------------------------------------------------------------------------
const colonias = [[-52, 30], [-56, 38], [-52, 46], [-46, 46], [-44, 42], [-40, 40.2], [-35.5, 42.5], [-36, 49], [-30, 54], [-24, 50], [-20, 44], [-22, 34], [-28, 24], [-40, 18], [-50, 20]];

export const nationColors = {
  fire: [176, 52, 38],
  earth: [92, 128, 64],
  water: [56, 104, 160],
  air: [214, 150, 52],
  republic: [150, 104, 60],
  havens: [200, 170, 90],
};

export const territories = {
  aang: [
    { nation: 'earth', polyRef: 'grande-continente' },
    { nation: 'fire', poly: colonias, label: 'Colônias do Fogo' },
    { nation: 'fire', polyRefs: ['ilha-principal-fogo', 'ilha-ember', 'ilha-crescente', 'ilha-roku', 'ilha-rocha-fervente', 'ilhas-sul-fogo', 'ilha-shu-jing', 'ilhas-oeste-fogo'] },
    { nation: 'earth', polyRefs: ['ilha-kyoshi', 'ilha-rabo-de-baleia', 'ilha-lua-crescente', 'ilhas-orientais-2'] },
    { nation: 'air', polyRefs: ['terra-templo-oeste', 'ilha-patola'] },
    { nation: 'water', polyRefs: ['polo-norte', 'polo-sul'] },
  ],
  korra: [
    { nation: 'earth', polyRef: 'grande-continente' },
    { nation: 'republic', poly: colonias, label: 'República Unida das Nações' },
    { nation: 'fire', polyRefs: ['ilha-principal-fogo', 'ilha-ember', 'ilha-crescente', 'ilha-roku', 'ilha-rocha-fervente', 'ilhas-sul-fogo', 'ilha-shu-jing', 'ilhas-oeste-fogo'] },
    { nation: 'earth', polyRefs: ['ilha-kyoshi', 'ilha-rabo-de-baleia', 'ilha-lua-crescente', 'ilhas-orientais-2'] },
    { nation: 'air', polyRefs: ['terra-templo-oeste', 'ilha-patola'] },
    { nation: 'water', polyRefs: ['polo-norte', 'polo-sul'] },
  ],
  // Era dos Sete Refúgios: as Quatro Nações caíram; apenas zonas habitáveis
  havens: [],
};

// Fronteiras terrestres desenhadas (tracejado) — só o trecho no interior
const fronteiraColonias = [[-30, 54], [-24, 50], [-20, 44], [-22, 34], [-28, 24], [-40, 18], [-51, 20]];
export const borders = { aang: [fronteiraColonias], korra: [fronteiraColonias], havens: [] };

// ---------------------------------------------------------------------------
function circle(lon, lat, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // pequena irregularidade determinística
    const k = 1 + 0.12 * Math.sin(a * 3 + lon) + 0.08 * Math.cos(a * 5 + lat);
    pts.push([lon + Math.cos(a) * rx * k, lat + Math.sin(a) * ry * k]);
  }
  return pts;
}

function ring(lon, lat, rx, ry, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([lon + Math.cos(a) * rx, lat + Math.sin(a) * ry]);
  }
  return pts;
}

export function landById(id) {
  return land.find((l) => l.id === id);
}
