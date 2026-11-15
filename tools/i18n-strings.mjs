#!/usr/bin/env node
// Ferramenta de tradução.
//
// Cada tradução fica numa linha "<código do texto><TAB><tradução>" em
// i18n-src/<idioma>.tsv. O código vem do texto em português (hash), então
// mudar a ordem dos lugares não quebra nada; textos novos ou alterados
// aparecem em "list --missing xx" e, até serem traduzidos, saem em inglês
// (ou em português, se nem o inglês existir).
//
//   node tools/i18n-strings.mjs list [--missing xx]  -> textos (a traduzir)
//   node tools/i18n-strings.mjs build [xx]           -> gera public/i18n/*.json
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PT } from '../src/i18n-pt.js';
import { ERAS } from '../src/eras.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/places.json'), 'utf8')).places;
const KEEP_REF = /^(ATLA|LoK) L\d|^The Promise/; // títulos de episódio em inglês ficam como estão
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 7);

// árvore com os textos de origem (mesma forma de public/i18n/*.json)
const tree = { ui: {}, places: {}, eras: {} };
const texts = new Set();
const put = (obj, key, text) => { if (text != null && text !== '') { obj[key] = text; texts.add(text); } };
for (const [k, v] of Object.entries(PT)) put(tree.ui, k, v);
for (const p of places) {
  const o = (tree.places[p.id] = {});
  put(o, 'name', p.name);
  put(o, 'desc', p.desc);
  if (p.aka) { o.aka = []; p.aka.forEach((a, i) => put(o.aka, i, a)); }
  if (p.refs) { o.refs = []; p.refs.forEach((r, i) => { if (KEEP_REF.test(r)) o.refs[i] = r; else put(o.refs, i, r); }); }
  for (const [era, e] of Object.entries(p.eras)) {
    const x = {};
    for (const f of ['name', 'desc', 'status']) put(x, f, e[f]);
    if (Object.keys(x).length) (o.eras ??= {})[era] = x;
  }
}
for (const e of ERAS) {
  const o = (tree.eras[e.id] = {});
  for (const f of ['label', 'short', 'years', 'summary', 'sources']) put(o, f, e[f]);
  if (e.unknown) { o.unknown = []; e.unknown.forEach((u, i) => put(o.unknown, i, u)); }
}
const unique = [...texts];

const readTsv = (file) => {
  const m = new Map();
  if (!fs.existsSync(file)) return m;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const x = /^([0-9a-f]{7})\t(.*)$/.exec(line);
    if (x) m.set(x[1], x[2]);
  }
  return m;
};
const src = (c) => path.join(ROOT, 'i18n-src', `${c}.tsv`);
const vars = (s) => (s.match(/\{[a-z_0-9]+\}/g) ?? []).sort().join();

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'list') {
  const have = a === '--missing' ? readTsv(src(b)) : new Map();
  console.log(unique.filter((s) => !have.has(hash(s))).map((s) => `${hash(s)}\t${s}`).join('\n'));
} else if (cmd === 'build') {
  const codes = a ? [a] : fs.readdirSync(path.join(ROOT, 'i18n-src')).filter((f) => f.endsWith('.tsv')).map((f) => f.slice(0, -4));
  const en = readTsv(src('en'));
  for (const c of codes) {
    const tr = readTsv(src(c));
    let done = 0;
    const map = new Map(unique.map((s) => {
      const h = hash(s);
      const own = tr.get(h);
      if (own != null && vars(own) === vars(s)) { done++; return [s, own]; }
      const fallback = en.get(h);
      return [s, fallback != null && vars(fallback) === vars(s) ? fallback : s];
    }));
    const swap = (node) => {
      if (typeof node === 'string') return map.get(node) ?? node;
      if (Array.isArray(node)) return node.map(swap);
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]));
    };
    const out = swap(tree);
    const ver = hash(JSON.stringify(out));
    fs.writeFileSync(path.join(ROOT, `public/i18n/${c}.json`), `${JSON.stringify({ ver, ...out })}\n`);
    console.log(`${c}: ${done}/${unique.length} traduzidos`);
  }
}
