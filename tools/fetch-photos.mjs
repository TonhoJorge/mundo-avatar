#!/usr/bin/env node
// Busca no Avatar Wiki (Fandom) as imagens de cada lugar e grava
// public/data/photos.json. As imagens NÃO são copiadas: o site só aponta para
// os endereços públicos do wiki, com crédito e link para a página de origem.
//
//   node tools/fetch-photos.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://avatar.fandom.com/api.php';
const MAX = 4;

// id do lugar -> título da página no Avatar Wiki (em inglês)
const WIKI = {
  'reino-da-terra': 'Earth Kingdom', 'nacao-do-fogo': 'Fire Nation',
  'tribo-agua-norte-regiao': 'Northern Water Tribe', 'tribo-agua-sul-regiao': 'Southern Water Tribe',
  'colonias-do-fogo': 'Fire Nation colonies', 'terras-duras': 'Seven Havens', 'deserto-si-wong': 'Si Wong Desert',
  'pantano-nebuloso': 'Foggy Swamp', 'mar-mo-ce': 'Mo Ce Sea', 'baia-yue': 'Yue Bay', 'lago-oriental': 'Eastern Lake',
  'baia-lua-cheia': 'Full Moon Bay', 'baia-camaleao': 'Chameleon Bay', 'templo-ar-sul': 'Southern Air Temple',
  'templo-ar-norte': 'Northern Air Temple', 'templo-ar-oeste': 'Western Air Temple', 'templo-ar-leste': 'Eastern Air Temple',
  'ilha-templo-ar': 'Air Temple Island', 'capital-fogo': 'Fire Nation Capital', 'ilha-ember': 'Ember Island',
  'ilha-crescente': 'Crescent Island', 'ilha-roku': "Roku's island", 'rocha-fervente': 'Boiling Rock',
  'guerreiros-do-sol': "Sun Warriors' ancient city", 'fonte-de-fogo': 'Fire Fountain City', 'shu-jing': 'Shu Jing',
  'tribo-agua-norte': "Agna Qel'a", 'oasis-espiritual': 'Spirit Oasis', 'portal-norte': 'Spirit portal',
  'tribo-agua-sul': 'Southern Water Tribe', 'portal-sul': 'Spirit portal', 'ba-sing-se': 'Ba Sing Se',
  'lago-laogai': 'Lake Laogai', omashu: 'Omashu', 'caverna-dois-amantes': 'Cave of Two Lovers', gaoling: 'Gaoling',
  'ilha-kyoshi': 'Kyoshi Island', 'vila-chin': 'Chin Village', 'vila-senlin': 'Senlin Village', makapu: 'Makapu Village',
  'grande-divisao': 'Great Divide', 'oasis-palmeiras': 'Misty Palms Oasis', 'biblioteca-wan-shi-tong': "Wan Shi Tong's Library",
  'passagem-serpente': "Serpent's Pass", 'floresta-wulong': 'Wulong Forest', 'yu-dao': 'Yu Dao',
  'cidade-republica': 'Republic City', zaofu: 'Zaofu', ellora: 'Ellora', 'ilhas-flutuantes': 'Seven Havens',
  akasha: 'Akasha', 'floresta-republica': 'Seven Havens', 'montanha-da-pena': 'Feather Mountain',
  'refugio-ilhas-do-fogo': 'Seven Havens', 'arquipelago-do-sul': 'Southern Archipelago',
  'montanhas-taihua': 'Taihua Mountains', 'cordilheira-kolau': 'Kolau Mountain Range',
};

const SKIP = /\.(svg|gif)$|logo|icon|symbol|emblem|insignia|flag|map|navbox|stub|template|banner|portrait|book|cover/i;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'mundo-avatar-fan-map/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const words = (s) => s.toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);

async function photosFor(title) {
  const q = await api({ action: 'query', titles: title, redirects: '1', prop: 'pageimages|images', piprop: 'name', imlimit: '200' });
  const page = q.query?.pages?.[0];
  if (!page || page.missing) return null;
  const key = words(page.title);
  const files = (page.images ?? []).map((i) => i.title).filter((t) => !SKIP.test(t));
  const related = files.filter((t) => key.some((w) => t.toLowerCase().includes(w)));
  const pool = related.length ? related : files.slice(0, 2);
  const picks = [...new Set([page.pageimage && `File:${page.pageimage}`, ...pool].filter(Boolean))].slice(0, MAX);
  if (!picks.length) return { page: page.title, fotos: [] };
  const info = await api({ action: 'query', titles: picks.join('|'), prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640' });
  const byTitle = new Map((info.query?.pages ?? []).map((p) => [p.title, p.imageinfo?.[0]]));
  const fotos = picks.map((t) => {
    const ii = byTitle.get(t);
    return ii && { src: ii.thumburl ?? ii.url, full: ii.url, file: ii.descriptionurl };
  }).filter(Boolean);
  return { page: page.title, fotos };
}

const out = {};
for (const [id, title] of Object.entries(WIKI)) {
  try {
    const r = await photosFor(title);
    if (!r) { console.log(`--  ${id}: página "${title}" não existe`); continue; }
    out[id] = { wiki: `https://avatar.fandom.com/wiki/${encodeURIComponent(r.page.replace(/ /g, '_'))}`, fotos: r.fotos };
    console.log(`${String(r.fotos.length).padStart(2)}  ${id} (${r.page})`);
  } catch (e) {
    console.log(`!!  ${id}: ${e.message}`);
  }
  await new Promise((ok) => setTimeout(ok, 250));
}
await fs.writeFile(path.join(ROOT, 'public/data/photos.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`\n${Object.keys(out).length} lugares com página no wiki`);
