#!/usr/bin/env node
// Gera as fontes dos rótulos do mapa no formato de glifos SDF (.pbf) que o
// MapLibre usa. Roda só em desenvolvimento (precisa do Chromium do Playwright);
// os .pbf gerados ficam versionados em public/fonts/.
//
//   node tools/build-glyphs.mjs

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Cada fonte junta o arquivo latino e o cirílico (rótulos em russo). A Marcellus
// não tem cirílico: nesses glifos o navegador cai para a Alegreya.
const AL = '@fontsource/alegreya/files/alegreya';
const FONTS = [
  { id: 'marcellus-sc', style: 'normal', files: ['@fontsource/marcellus-sc/files/marcellus-sc-latin-400-normal.woff2'], fallback: 'alegreya-regular' },
  { id: 'alegreya-regular', style: 'normal', files: [`${AL}-latin-400-normal.woff2`, `${AL}-cyrillic-400-normal.woff2`] },
  { id: 'alegreya-italic', style: 'italic', files: [`${AL}-latin-400-italic.woff2`, `${AL}-cyrillic-400-italic.woff2`] },
];
const RANGES = [[0, 255], [1024, 1279], [8192, 8447]];

// --- protobuf mínimo (formato glyphs.proto do MapLibre/Mapbox) ---
function varint(out, n) {
  while (n > 127) { out.push((n & 127) | 128); n >>>= 7; }
  out.push(n);
}
const zigzag = (n) => ((n << 1) ^ (n >> 31)) >>> 0;
function field(out, num, type) { varint(out, (num << 3) | type); }
function bytesField(out, num, bytes) { field(out, num, 2); varint(out, bytes.length); for (const b of bytes) out.push(b); }

function encodeGlyph(g) {
  const out = [];
  field(out, 1, 0); varint(out, g.id);
  if (g.data) bytesField(out, 2, g.data);
  field(out, 3, 0); varint(out, g.w);
  field(out, 4, 0); varint(out, g.h);
  field(out, 5, 0); varint(out, zigzag(g.left));
  field(out, 6, 0); varint(out, zigzag(g.top));
  field(out, 7, 0); varint(out, g.adv);
  return out;
}
function encodeRange(name, range, glyphs) {
  const stack = [];
  bytesField(stack, 1, Buffer.from(name));
  bytesField(stack, 2, Buffer.from(range));
  for (const g of glyphs) bytesField(stack, 3, encodeGlyph(g));
  const out = [];
  bytesField(out, 1, stack);
  return Buffer.from(out);
}

async function main() {
  const { chromium } = require('playwright');
  const sdfSrc = (await fs.readFile(path.join(ROOT, 'node_modules/@mapbox/tiny-sdf/index.js'), 'utf8'))
    .replace('export default class TinySDF', 'window.TinySDF = class TinySDF');
  if (!sdfSrc.includes('window.TinySDF')) throw new Error('Formato inesperado do tiny-sdf');

  let css = '';
  for (const f of FONTS) {
    for (const file of f.files) {
      const b64 = (await fs.readFile(path.join(ROOT, 'node_modules', file))).toString('base64');
      css += `@font-face{font-family:"${f.id}";font-style:${f.style};src:url(data:font/woff2;base64,${b64})}`;
    }
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style>`);
    await page.addScriptTag({ content: sdfSrc });
    for (const f of FONTS) {
      await page.evaluate(async ([id, style]) => { await document.fonts.load(`${style} 24px "${id}"`, 'aЖ'); }, [f.id, f.style]);
      if (f.fallback) await page.evaluate(async (id) => { await document.fonts.load(`24px "${id}"`, 'Ж'); }, f.fallback);
      const family = f.fallback ? `"${f.id}","${f.fallback}"` : `"${f.id}"`;
      for (const [a, b] of RANGES) {
        const glyphs = await page.evaluate(([family, style, a, b]) => {
          const sdf = new window.TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: family, fontStyle: style });
          const out = [];
          for (let cp = a; cp <= b; cp++) {
            if (cp < 32 || (cp >= 127 && cp < 160)) continue;
            const g = sdf.draw(String.fromCharCode(cp));
            const has = g.glyphWidth > 0 && g.glyphHeight > 0;
            out.push({
              id: cp,
              w: has ? g.glyphWidth : 0,
              h: has ? g.glyphHeight : 0,
              // mesmo ajuste de linha de base que o MapLibre usa para glifos locais
              left: Math.round(g.glyphLeft),
              top: Math.round(g.glyphTop - 27.5),
              adv: Math.max(0, Math.round(g.glyphAdvance)),
              data: has ? Array.from(g.data) : null,
            });
          }
          return out;
        }, [family, f.style, a, b]);
        const dir = path.join(ROOT, 'public/fonts', f.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${a}-${b}.pbf`), encodeRange(f.id, `${a}-${b}`, glyphs));
        console.log(`${f.id} ${a}-${b}: ${glyphs.length} glifos`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
