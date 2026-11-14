#!/usr/bin/env node
// Converte uma imagem plana do mapa (projeção equirretangular) em tiles para uma
// era, substituindo a pintura procedural. Use a arte que VOCÊ fornecer (ex.: o
// mapa oficial) — ela não faz parte do repositório.
//
//   node tools/import-art.mjs --era aang --input arte/aang.jpg [--bounds -180,-90,180,90] [--out public]
//   node tools/import-art.mjs --auto [--out dist]   # usa arte/<era>.jpg|jpeg|png|webp, se existir
//
// --bounds oeste,sul,leste,norte: parte do globo que a imagem cobre (padrão: o mundo todo).
// No modo --auto, os limites podem ficar em arte/<era>.bounds ("oeste,sul,leste,norte").
// Fora da imagem, os tiles recebem a cor --fill (padrão: azul do oceano).
// Rode depois de tools/render-world.mjs (usa o mesmo zoom máximo de tiles/meta.json).

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ERAS = ['aang', 'korra', 'havens'];
const EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const D2R = Math.PI / 180;

function parseBounds(text) {
  const b = String(text).trim().split(',').map(Number);
  const ok = b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3]
    && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90;
  if (!ok) throw new Error(`Limites inválidos: "${text}" (use oeste,sul,leste,norte em graus)`);
  return b;
}

function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Cor inválida: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function importEra({ era, input, bounds, out, fill, maxZoom }) {
  const [w, s, e, n] = bounds;
  const full = Math.abs(e - w - 360) < 1e-9;
  const src = await sharp(input).metadata();
  const dir = path.join(out, 'tiles', era);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${era}: ${input} (${src.width}x${src.height}) → zoom 0–${maxZoom}`);

  for (let z = 0; z <= maxZoom; z++) {
    const W = 256 * 2 ** z;
    // ~2 px de origem por px de tile: evita serrilhado nos zooms baixos
    const width = Math.max(64, Math.round((W * 2 * (e - w)) / 360));
    const { data, info } = await sharp(input)
      .resize({ width, withoutEnlargement: true, kernel: 'lanczos3' })
      .removeAlpha().toColourspace('srgb').raw()
      .toBuffer({ resolveWithObject: true });
    const sw = info.width, sh = info.height, ch = info.channels;
    const px = (x, y, c) => data[(y * sw + x) * ch + c];
    const jobs = [];
    for (let tx = 0; tx < 2 ** z; tx++) {
      fs.mkdirSync(path.join(dir, String(z), String(tx)), { recursive: true });
      for (let ty = 0; ty < 2 ** z; ty++) {
        const buf = Buffer.allocUnsafe(256 * 256 * 3);
        for (let j = 0; j < 256; j++) {
          const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty * 256 + j + 0.5)) / W))) / D2R;
          const fy = Math.min(sh - 1, Math.max(0, ((n - lat) / (n - s)) * sh - 0.5));
          const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ky = fy - y0;
          for (let i = 0; i < 256; i++) {
            const o = (j * 256 + i) * 3;
            const lon = ((tx * 256 + i + 0.5) / W) * 360 - 180;
            if (lat > n || lat < s || lon < w || lon > e) {
              buf[o] = fill[0]; buf[o + 1] = fill[1]; buf[o + 2] = fill[2];
              continue;
            }
            let fx = ((lon - w) / (e - w)) * sw - 0.5;
            let x0 = Math.floor(fx), x1 = x0 + 1;
            const kx = fx - x0;
            if (full) { x0 = (x0 + sw) % sw; x1 = x1 % sw; } // repete na linha de data
            else { x0 = Math.max(0, x0); x1 = Math.min(sw - 1, x1); }
            for (let c = 0; c < 3; c++) {
              const top = px(x0, y0, c) + (px(x1, y0, c) - px(x0, y0, c)) * kx;
              const bot = px(x0, y1, c) + (px(x1, y1, c) - px(x0, y1, c)) * kx;
              buf[o + c] = top + (bot - top) * ky;
            }
          }
        }
        jobs.push(sharp(buf, { raw: { width: 256, height: 256, channels: 3 } })
          .webp({ quality: 82, effort: 4 })
          .toFile(path.join(dir, String(z), String(tx), `${ty}.webp`)));
        if (jobs.length >= 16) await Promise.all(jobs.splice(0));
      }
    }
    await Promise.all(jobs);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const out = path.resolve(ROOT, opt('out', 'public'));
  const fill = parseColor(opt('fill', '#7fa6b4'));
  const metaFile = path.join(out, 'tiles', 'meta.json');
  if (!fs.existsSync(metaFile)) throw new Error(`${metaFile} não existe: rode tools/render-world.mjs antes.`);
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

  const tasks = [];
  if (args.includes('--auto')) {
    for (const era of ERAS) {
      const ext = EXTS.find((x) => fs.existsSync(path.join(ROOT, 'arte', `${era}.${x}`)));
      if (!ext) continue;
      const bFile = path.join(ROOT, 'arte', `${era}.bounds`);
      tasks.push({
        era,
        input: path.join(ROOT, 'arte', `${era}.${ext}`),
        bounds: parseBounds(fs.existsSync(bFile) ? fs.readFileSync(bFile, 'utf8') : '-180,-90,180,90'),
      });
    }
    if (!tasks.length) { console.log('Nenhuma arte em arte/ — mantendo o mapa procedural.'); return; }
  } else {
    const era = opt('era'), input = opt('input');
    if (!ERAS.includes(era) || !input || !fs.existsSync(input)) {
      throw new Error('Uso: --era aang|korra|havens --input imagem [--bounds o,s,l,n] [--out pasta] | --auto');
    }
    tasks.push({ era, input, bounds: parseBounds(opt('bounds', '-180,-90,180,90')) });
  }

  for (const t of tasks) await importEra({ ...t, out, fill, maxZoom: meta.maxzoom });
  meta.art = { ...(meta.art ?? {}), ...Object.fromEntries(tasks.map((t) => [t.era, path.basename(t.input)])) };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  console.log('Arte importada.');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
