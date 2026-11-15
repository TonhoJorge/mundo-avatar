// Projeção do mapa oficial (imagem plana 3840×2160 do Avatar Wiki) para o globo.
//
// O mapa oficial é tratado como um mapa de MERCATOR. Assim:
//  - no modo plano do site (Web Mercator), a geometria é idêntica à do mapa
//    oficial, ponto por ponto;
//  - no globo, cada ponto vai para a esfera pela inversa exata de Mercator
//    (φ = 2·atan(e^y) − π/2), a correção cartográfica rigorosa da distorção
//    de área do mapa plano perto dos polos.
//
// Escala horizontal herdada da calibração anterior: 360° de longitude ocupam
// 62,07% da largura (5,8° por 1% da imagem), com o meridiano 0 no centro.
// O equador fica onde a calibração anterior o punha (49,35% da altura).

export const IMG_W = 3840;
export const IMG_H = 2160;
const X0 = IMG_W / 2; // meridiano 0
const PX_PER_DEG = IMG_W / 100 / 5.8; // 6,62 px por grau de longitude
const R = (PX_PER_DEG * 180) / Math.PI; // raio da projeção em px (379,3)
const Y_EQ = ((139.2 / 2.821) / 100) * IMG_H; // equador (1065,9 px)
const D2R = Math.PI / 180;

/** Pixel da imagem oficial → [lon, lat] em graus. */
export function imageToLonLat(x, y) {
  const lon = (x - X0) / PX_PER_DEG;
  const lat = (2 * Math.atan(Math.exp((Y_EQ - y) / R)) - Math.PI / 2) / D2R;
  return [lon, lat];
}

/** [lon, lat] em graus → pixel da imagem oficial. */
export function lonLatToImage(lon, lat) {
  const x = X0 + lon * PX_PER_DEG;
  const y = Y_EQ - R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
  return [x, y];
}

/**
 * Converte uma latitude da calibração antiga (linear: lat = 139,2 − 2,821·y%)
 * para a projeção de Mercator, mantendo o mesmo ponto da imagem oficial.
 */
export function oldLatToMercator(lat) {
  const yPct = (139.2 - lat) / 2.821;
  return imageToLonLat(X0, (yPct / 100) * IMG_H)[1];
}
