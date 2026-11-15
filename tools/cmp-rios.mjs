// Prova dos rios: sobrepõe world/trace/river.png (equirretangular) ao mapa oficial (Mercator) em vermelho.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lonLatToImage, IMG_W, IMG_H } from '../world/projection.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { data: img } = await sharp(path.join(ROOT, 'arte/referencia/mapa-oficial.jpeg')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: riv, info } = await sharp(path.join(ROOT, 'world/trace/river.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
const OW = info.width, OH = info.height;
const out = Buffer.from(img);
for (let v = 0; v < OH; v++) for (let u = 0; u < OW; u++) {
  if (riv[v * OW + u] < 100) continue;
  const lon = ((u + 0.5) / OW) * 360 - 180, lat = 90 - ((v + 0.5) / OH) * 180;
  const [x, y] = lonLatToImage(lon, lat);
  const ix = Math.round(x), iy = Math.round(y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = ix + dx, Y = iy + dy;
    if (X < 0 || Y < 0 || X >= IMG_W || Y >= IMG_H) continue;
    out.set([255, 0, 0], (Y * IMG_W + X) * 3);
  }
}
const s = sharp(out, { raw: { width: IMG_W, height: IMG_H, channels: 3 } });
await s.clone().resize(1920).png().toFile(path.join(ROOT, 'arte/referencia/cmp-rios.png'));
const crop = process.argv[2]?.split(',').map(Number);
if (crop) await s.clone().extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }).png().toFile(path.join(ROOT, 'arte/referencia/cmp-rios-zoom.png'));
