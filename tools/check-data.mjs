#!/usr/bin/env node
// Valida public/data/places.json (roda antes de cada build).
import fs from 'node:fs';

const ERAS = ['aang', 'korra', 'havens'];
const TYPES = ['capital', 'city', 'village', 'temple', 'haven', 'landmark', 'spirit', 'region', 'water'];
const NATIONS = ['earth', 'fire', 'water', 'air', 'republic', 'havens', 'none'];
const CONF = ['alta', 'media', 'baixa'];
const CANON = ['serie', 'quadrinhos', 'livros', 'rumor'];

let data;
try {
  data = JSON.parse(fs.readFileSync(new URL('../public/data/places.json', import.meta.url), 'utf8'));
} catch (e) {
  console.error(`places.json ilegível: ${e.message}`);
  process.exit(1);
}

const errors = [];
const ids = new Set();
if (!Array.isArray(data.places)) errors.push('campo "places" ausente');
for (const [i, p] of (data.places ?? []).entries()) {
  const err = (m) => errors.push(`${p?.id ?? `#${i}`}: ${m}`);
  if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id)) err('id inválido (use a-z, 0-9 e hífen)');
  if (ids.has(p.id)) err('id repetido');
  ids.add(p.id);
  if (typeof p.name !== 'string' || !p.name.trim()) err('name vazio');
  if (!TYPES.includes(p.type)) err(`type inválido: ${p.type}`);
  if (!(p.lon >= -180 && p.lon <= 180)) err('lon fora de -180..180');
  if (!(p.lat >= -85 && p.lat <= 85)) err('lat fora de -85..85 (limite do mapa)');
  if (![1, 2, 3].includes(p.rank)) err('rank deve ser 1, 2 ou 3');
  if (!CONF.includes(p.conf)) err(`conf inválida: ${p.conf}`);
  if (!CANON.includes(p.canon)) err(`canon inválido: ${p.canon}`);
  if (typeof p.desc !== 'string' || !p.desc.trim()) err('desc vazia');
  if (p.aka !== undefined && !Array.isArray(p.aka)) err('aka deve ser lista');
  if (p.refs !== undefined && !Array.isArray(p.refs)) err('refs deve ser lista');
  const eras = Object.keys(p.eras ?? {});
  if (!eras.length) err('precisa existir em pelo menos uma era');
  for (const e of eras) {
    const v = p.eras[e];
    if (!ERAS.includes(e)) err(`era desconhecida: ${e}`);
    else if (typeof v !== 'object' || v === null) err(`eras.${e} deve ser um objeto`);
    else {
      if (v.nation !== undefined && !NATIONS.includes(v.nation)) err(`eras.${e}.nation inválida: ${v.nation}`);
      for (const k of ['zone', 'spirit']) {
        if (v[k] !== undefined && !(v[k] > 0 && v[k] < 15)) err(`eras.${e}.${k} deve ser um raio em graus (0–15)`);
      }
    }
  }
}

if (errors.length) {
  console.error(`places.json: ${errors.length} problema(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`places.json ok (${data.places.length} lugares)`);
