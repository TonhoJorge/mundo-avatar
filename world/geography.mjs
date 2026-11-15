// Geografia base do Mundo Avatar, em graus [longitude, latitude].
//
// As formas foram posicionadas a partir do mapa-múndi oficial da série (usado
// apenas como referência de posição; nada da arte é copiado) e das descrições
// de localização do Avatar Wiki. Conversão usada do mapa plano para o globo:
//   longitude = (x% − 50) × 5,8      latitude = 139,2 − 2,821 × y%
// (x%, y% = posição na imagem do mapa oficial). Os contornos são simplificados.
//
// Compartilhado pelo gerador de tiles (tools/render-world.mjs).

// ---------------------------------------------------------------------------
// Massas de terra
// ---------------------------------------------------------------------------
const URN = [
  [-59, 30], [-60, 36], [-57.5, 42], [-53, 48], [-49, 54], [-45, 58.5], [-39, 60.5], [-33, 59], [-27, 60],
  [-20, 59], [-14, 57.5], [-8, 56.5], [-6, 50], [-8, 42], [-11, 35], [-13, 36], [-17, 36.5], [-22, 37],
  [-27, 36.5], [-31, 34], [-36, 30], [-42, 27], [-49, 25], [-55, 27],
];

export const land = [
  {
    id: 'grande-continente',
    name: 'Grande Continente',
    poly: [
      // costa oeste e norte da antiga região das colônias (República Unida)
      [-59, 30], [-60, 36], [-57.5, 42], [-53, 48], [-49, 54], [-45, 58.5], [-39, 60.5], [-33, 59], [-27, 60],
      [-20, 59], [-14, 57.5], [-8, 56.5], [-3, 58], [0, 62],
      // costa norte (Montanhas Taihua) e nordeste
      [9, 64], [17, 66.5], [26, 68], [38, 68.5], [50, 67], [63, 63], [72, 59], [81, 55], [88, 53], [93, 51.5],
      [96, 50.5], [91, 47.5], [97, 46], [103, 40], [106, 35], [110, 31], [115, 26], [118, 17], [121, 7],
      // península em gancho que fecha a grande baía do leste
      [121, -1], [116, -7.7], [111, -10], [109, -6.5], [113, 0], [114, 6.5], [111, 14], [104, 18.4], [97, 19.7],
      [89, 19], [82, 15.8], [79, 9.3], [78.5, 1.5], [82, -3.7], [89, -5], [96, -7.7], [92, -10], [90.6, -14],
      // sudeste e o arco de terra ao sul
      [88, -19], [86, -23], [92, -25], [100, -27], [101, -31], [96, -34], [90, -38], [84, -43], [77, -48],
      [71, -50], [70, -47], [76, -42], [82, -37], [84, -31], [79, -27], [72.5, -29.8],
      // costa sul e sudoeste
      [63.4, -29.8], [54, -28.5], [45, -29.8], [35, -28.5], [27, -30], [18, -28.5], [10.6, -26], [7, -21],
      [9, -15], [6, -9], [2, -5], [-4, -1], [-8, 4], [-10, 12], [-11, 16], [-9, 22], [-10, 28], [-11, 33],
      // costa norte do mar interior (Baía Yue)
      [-13, 36], [-17, 36.5], [-22, 37], [-27, 36.5], [-31, 34], [-36, 30], [-42, 27], [-49, 25], [-55, 27],
    ],
  },
  { id: 'ilha-baia-yue', name: 'Ilha da Baía Yue', poly: circle(-21, 29.5, 3.2, 2.8, 10) },
  { id: 'ilha-templo-ar', name: 'Ilha do Templo do Ar', poly: circle(-19.5, 34.6, 1.2, 0.9, 8) },

  // Nação do Fogo: anel vulcânico aberto para o leste + ilhas
  {
    id: 'fogo-principal',
    name: 'Ilha principal da Nação do Fogo',
    poly: [
      [-129, 2], [-127, 9], [-121, 12.5], [-114, 16], [-106, 14], [-100, 12], [-95, 13], [-90, 9], [-84, 7],
      [-80, 5], [-81, 2], [-88, 3], [-96, 2], [-100, -1], [-98, -5], [-90, -6], [-82, -6.5], [-74, -6], [-68, -8],
      [-67, -12], [-72, -14], [-78, -13], [-84, -15], [-86, -21], [-92, -23], [-96, -19], [-100, -14],
      [-108, -13], [-116, -11], [-123, -8], [-128, -4],
    ],
  },
  { id: 'ilha-ember', name: 'Ilha Ember', poly: circle(-74, 3.5, 2.2, 1.7, 9) },
  { id: 'ilha-crescente', name: 'Ilha Crescente', poly: [[-61.5, 0], [-56, 1.5], [-50, 0], [-48, -4], [-51, -8.5], [-58, -9], [-61, -5]] },
  { id: 'ilhas-leste-fogo-1', name: 'Ilhas do leste', poly: circle(-42.5, 2, 2.6, 3, 9) },
  { id: 'ilhas-leste-fogo-2', name: 'Ilhas do leste', poly: circle(-38, 5, 2.2, 3.2, 9) },
  { id: 'ilhas-leste-fogo-3', name: 'Ilhas do leste', poly: circle(-32, 13, 2.4, 1.6, 9) },
  { id: 'ilhas-leste-fogo-4', name: 'Ilhas do leste', poly: circle(-25, 13, 3, 1.6, 9) },

  // Terras dos Nômades do Ar
  {
    id: 'terra-templo-oeste',
    name: 'Cordilheira do Templo do Ar do Oeste',
    poly: [[-107, 47], [-104, 54], [-96, 56], [-88, 53.5], [-80, 55], [-73, 52], [-74, 46], [-82, 43.5], [-87, 41],
      [-89, 33], [-94, 31], [-97, 37], [-104, 41]],
  },
  { id: 'ilha-templo-oeste', name: 'Ilha ao sul do Templo do Oeste', poly: circle(-97, 29, 2.6, 2, 9) },
  { id: 'ilhas-noroeste', name: 'Ilhas do noroeste', poly: [[-70, 52], [-66, 57], [-60, 54], [-60.5, 47.5], [-66, 46]] },
  {
    id: 'terra-templo-leste',
    name: 'Cordilheira do Templo do Ar do Leste',
    poly: [[104, -12], [111, -10.5], [118, -14], [124, -20], [125, -27], [119, -31], [113, -33], [111, -40],
      [112, -46], [106, -49], [103, -45], [104, -37], [107, -30], [104, -22]],
  },
  // Arquipélago do Sul (Cordilheira Patola e vizinhas)
  { id: 'sul-1', name: 'Arquipélago do Sul', poly: circle(-64, -49, 4.5, 3.5, 10) },
  { id: 'sul-2', name: 'Arquipélago do Sul', poly: [[-55, -50], [-58, -46], [-53, -42], [-52, -38], [-50, -39], [-49, -44], [-48, -49]] },
  { id: 'sul-3', name: 'Arquipélago do Sul', poly: circle(-53, -55, 4.2, 2.6, 10) },
  { id: 'sul-4', name: 'Ilha Rabo-de-Baleia', poly: [[-48, -58], [-42, -55], [-34, -55], [-30, -58], [-34, -62], [-44, -62]] },
  {
    id: 'patola',
    name: 'Cordilheira Patola',
    poly: [[-44, -48], [-40, -44], [-34, -45], [-30, -42], [-25, -43], [-21, -48], [-22, -55], [-27, -58], [-31, -54], [-37, -52], [-43, -52]],
  },
  { id: 'sul-5', name: 'Arquipélago do Sul', poly: circle(-17, -56.5, 5, 2.6, 10) },
  { id: 'sul-6', name: 'Arquipélago do Sul', poly: circle(-14.5, -43, 4.5, 3, 10) },
  { id: 'sul-7', name: 'Arquipélago do Sul', poly: [[-15, -47], [-10, -44], [-2, -42], [5, -40], [11, -43], [13, -47], [5, -50], [-6, -52], [-13, -51]] },
  // Ilhas do Reino da Terra no Mar do Sul
  { id: 'ilha-kyoshi', name: 'Ilha Kyoshi', poly: [[-14, -34], [-9, -31], [-2, -30.5], [3, -32], [2, -35], [-5, -37], [-12, -37]] },
  { id: 'ilhas-sul-terra-1', name: 'Ilhas do sul', poly: circle(11.5, -54, 3, 2.4, 9) },
  { id: 'ilhas-sul-terra-2', name: 'Ilhas do sul', poly: [[31, -32], [38, -30.5], [46, -31], [50, -34], [47, -39], [39, -40], [33, -37]] },
  { id: 'ilhas-sul-terra-3', name: 'Ilhas do sul', poly: [[45, -47], [52, -42], [62, -40], [72, -40], [75, -43], [68, -47], [58, -50], [48, -51]] },
  { id: 'ilhas-sul-terra-4', name: 'Ilhas do sul', poly: [[27, -55], [33, -51], [42, -51], [47, -55], [44, -60], [34, -60], [28, -58]] },
  { id: 'ilha-leste', name: 'Ilha do leste', poly: circle(124.5, 14, 3.5, 3.6, 9) },
  { id: 'ilhas-baia-leste', name: 'Ilhas da baía', poly: circle(101.5, 9, 2.2, 2.2, 8) },

  // Polos
  {
    id: 'polo-norte',
    name: 'Polo Norte',
    poly: [[-180, 90], [180, 90], [180, 81], [120, 82], [60, 81], [30, 80], [21, 78.5], [14, 77], [5, 75], [0, 72],
      [-6, 73], [-9, 68.5], [-16, 66], [-24, 67], [-29, 72], [-31, 78], [-40, 80.5], [-90, 81.5], [-150, 81], [-180, 81]],
  },
  {
    id: 'polo-sul',
    name: 'Polo Sul',
    poly: [[-180, -90], [-180, -81], [-120, -82], [-60, -81], [-40, -79], [-37, -75], [-30, -72], [-22, -69.5],
      [-11, -68.3], [1, -69], [8, -72], [15, -74.5], [19, -71.5], [23, -72.5], [27, -75], [29, -80], [60, -81.5],
      [120, -82], [180, -81], [180, -90]],
  },
];

// Lagos e mares interiores
export const lakes = [
  { id: 'lago-taihua', name: 'Lago a oeste de Ba Sing Se', poly: [[27, 33], [33, 36.5], [41, 36], [45, 32.5], [43, 28.5], [36, 27.5], [29, 29]] },
  { id: 'lago-oriental', name: 'Lago Oriental', poly: [[39, 22], [45, 25.5], [54, 26], [62, 24.5], [69, 22], [72, 18.5], [67, 15.5], [58, 16.5], [50, 15], [42, 16.5]] },
  { id: 'lago-laogai', name: 'Lago Laogai', poly: circle(81.5, 35.4, 1.8, 1.3, 9) },
];

// ---------------------------------------------------------------------------
// Relevo
// ---------------------------------------------------------------------------
export const mountains = [
  { name: 'Montanhas Taihua', line: [[4, 58], [15, 62], [28, 63.5], [42, 62.5], [52, 58], [56, 50], [56, 44]], width: 5, height: 1.0 },
  { name: 'Taihua, ao sul de Ba Sing Se', line: [[46, 31], [52, 29], [60, 28.5], [66, 28]], width: 3, height: 0.75 },
  { name: 'Cordilheira Kolau', line: [[9, 2], [16, -3], [24, -8], [30, -11]], width: 4, height: 0.95 },
  { name: 'Montanhas do noroeste', line: [[0, 20], [6, 15], [12, 13]], width: 3, height: 0.7 },
  { name: 'Serra leste do deserto', line: [[72, 12], [74, 2], [75, -8], [73, -18]], width: 3.5, height: 0.85 },
  { name: 'Serra sul do deserto', line: [[30, -18], [42, -21], [56, -20], [70, -20]], width: 3, height: 0.65 },
  { name: 'Colinas do Lago Oriental', line: [[36, 21], [42, 19]], width: 2.5, height: 0.6 },
  { name: 'Montanhas do sudeste', line: [[89, -27], [95, -30], [99, -32]], width: 3, height: 0.8 },
  { name: 'Serras do oeste (colônias)', line: [[-55, 28], [-48, 31], [-41, 30]], width: 3, height: 0.7 },
  { name: 'Serras do norte (colônias)', line: [[-37, 45], [-31, 41], [-26, 37.5]], width: 3, height: 0.7 },
  { name: 'Vulcões do norte do Fogo', line: [[-124, 6], [-118, 11], [-113, 13]], width: 3.5, height: 0.9 },
  { name: 'Vulcões centrais do Fogo', line: [[-104, 10], [-95, 10]], width: 3, height: 0.9 },
  { name: 'Vulcões do sul do Fogo', line: [[-116, -6], [-104, -9], [-92, -12], [-84, -17]], width: 3, height: 0.8 },
  { name: 'Caldeira da Capital', line: ring(-112, 3, 1.7, 1.4, 16), width: 0.8, height: 0.7 },
  { name: 'Vulcão da Ilha Crescente', line: [[-56, -2], [-54, -5]], width: 2.5, height: 0.9 },
  { name: 'Cordilheira do Templo do Ar do Oeste', line: [[-104, 50], [-94, 52], [-84, 51], [-76, 50]], width: 3.5, height: 1.0 },
  { name: 'Picos ao sul do Templo do Oeste', line: [[-92, 39], [-92, 33]], width: 2.5, height: 0.9 },
  { name: 'Picos do noroeste', line: [[-66, 54], [-63, 49]], width: 2.5, height: 0.9 },
  { name: 'Cordilheira do Templo do Ar do Leste', line: [[110, -14], [118, -20], [118, -28]], width: 3.5, height: 1.0 },
  { name: 'Picos do sul do Templo do Leste', line: [[108, -36], [107, -45]], width: 3, height: 0.9 },
  { name: 'Cordilheira Patola', line: [[-42, -48], [-34, -47], [-27, -46], [-23, -50]], width: 3, height: 1.0 },
  { name: 'Picos do Arquipélago do Sul', line: [[-8, -46], [2, -45], [9, -45]], width: 3, height: 0.9 },
  { name: 'Picos da Rabo-de-Baleia', line: [[-45, -58], [-36, -58]], width: 2.5, height: 0.8 },
  { name: 'Picos das ilhas a oeste', line: [[-56, -45], [-52, -41]], width: 2, height: 0.8 },
  { name: 'Picos da ilha mais a oeste', line: [[-66, -48], [-62, -50]], width: 2, height: 0.7 },
  { name: 'Geleiras do norte', line: [[-25, 76], [-5, 79], [15, 80]], width: 5, height: 0.7 },
  { name: 'Geleiras do sul', line: [[-30, -77], [-10, -75], [15, -78]], width: 5, height: 0.8 },
];

// Cânions (relevo negativo)
export const canyons = [
  { name: 'A Grande Divisão', line: [[28, 15], [32, 11.5], [36, 8.5]], width: 1.2, depth: 0.8 },
  { name: 'Cânions de Ellora', line: [[76, -19], [79, -21], [82, -21.5], [85, -20]], width: 0.45, depth: 0.55 },
];

// ---------------------------------------------------------------------------
// Biomas
// ---------------------------------------------------------------------------
export const biomes = {
  desert: [
    { name: 'Deserto de Si Wong', poly: [[24, 8], [36, 11], [50, 12], [64, 10], [70, 2], [70, -10], [64, -16], [52, -17], [40, -16], [30, -12], [24, -4]] },
    { name: 'Ermos de Ellora', poly: [[76, -17], [84, -16], [88, -21], [84, -25], [77, -25]] },
  ],
  forest: [
    { name: 'Floresta Wulong', poly: circle(-55, 38, 3.5, 4, 10) },
    { name: 'Floresta de Senlin', poly: circle(-44, 31, 3.5, 2.5, 10) },
    { name: 'Vales das Taihua', poly: [[20, 56], [35, 58], [48, 55], [40, 50], [25, 51]] },
    { name: 'Florestas do leste', poly: [[92, 42], [100, 40], [104, 32], [96, 28], [89, 34]] },
    { name: 'Florestas da península', poly: [[110, 16], [117, 12], [117, 2], [112, 4]] },
    { name: 'Selva do Fogo', poly: [[-98, -9], [-90, -10], [-88, -15], [-96, -16]] },
  ],
  swamp: [
    { name: 'Pântano Nebuloso', poly: circle(12, -20, 4.5, 3.5, 11) },
  ],
  farmland: [
    { name: 'Anel Agrário de Ba Sing Se', poly: circle(70, 39.5, 15.5, 10.5, 20) },
  ],
};

// Muralhas de Ba Sing Se
export const walls = [
  { name: 'Muralha Externa', center: [70, 39.5], rx: 16.2, ry: 11.1 },
  { name: 'Muralha Interna', center: [71.3, 39.6], rx: 7.2, ry: 6.2 },
];

// ---------------------------------------------------------------------------
// Territórios por era (tinta suave sobre o mapa)
// ---------------------------------------------------------------------------
// Tons do mapa oficial: Fogo laranja-avermelhado, Terra bege, Água azul-gelo, Ar branco-acinzentado
export const nationColors = {
  fire: [190, 78, 40],
  earth: [178, 150, 98],
  water: [168, 196, 222], // azul-gelo do mapa oficial
  air: [236, 233, 226],
  republic: [150, 104, 60],
  havens: [200, 170, 90],
};

const FIRE = ['fogo-principal', 'ilha-ember', 'ilha-crescente', 'ilhas-leste-fogo-1', 'ilhas-leste-fogo-2', 'ilhas-leste-fogo-3', 'ilhas-leste-fogo-4'];
const AIR = ['terra-templo-oeste', 'ilha-templo-oeste', 'ilhas-noroeste', 'terra-templo-leste', 'sul-1', 'sul-2', 'sul-3', 'sul-4', 'patola', 'sul-5', 'sul-6', 'sul-7'];
const EARTH_ISLANDS = ['ilha-kyoshi', 'ilhas-sul-terra-1', 'ilhas-sul-terra-2', 'ilhas-sul-terra-3', 'ilhas-sul-terra-4', 'ilha-leste', 'ilhas-baia-leste', 'ilha-baia-yue'];

export const territories = {
  aang: [
    { nation: 'earth', polyRef: 'grande-continente' },
    { nation: 'fire', poly: URN, label: 'Colônias do Fogo' },
    { nation: 'fire', polyRefs: FIRE },
    { nation: 'earth', polyRefs: EARTH_ISLANDS },
    { nation: 'air', polyRefs: [...AIR, 'ilha-templo-ar'] },
    { nation: 'water', polyRefs: ['polo-norte', 'polo-sul'] },
  ],
  korra: [
    { nation: 'earth', polyRef: 'grande-continente' },
    { nation: 'republic', poly: URN, label: 'República Unida das Nações' },
    { nation: 'fire', polyRefs: FIRE },
    { nation: 'earth', polyRefs: EARTH_ISLANDS },
    { nation: 'air', polyRefs: [...AIR, 'ilha-templo-ar'] },
    { nation: 'water', polyRefs: ['polo-norte', 'polo-sul'] },
  ],
  // Era dos Sete Refúgios: as Quatro Nações caíram
  havens: [],
};

// Fronteiras terrestres desenhadas (tracejado): limite leste das colônias/República
const fronteiraColonias = [[-7, 58], [-6, 50], [-8, 42], [-11, 35]];
export const borders = { aang: [fronteiraColonias], korra: [fronteiraColonias], havens: [] };

// ---------------------------------------------------------------------------
function circle(lon, lat, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + lon) + 0.08 * Math.cos(a * 5 + lat); // irregularidade determinística
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
