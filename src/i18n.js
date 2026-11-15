// Idiomas: dicionário da interface, traduções do catálogo e tradução
// automática (no próprio navegador) para os idiomas sem pacote pronto.

import { PT } from './i18n-pt.js';
import { storage, getJSON } from './util.js';

const KEY = 'mundo-avatar:idioma';
const AUTO_KEY = (code) => `mundo-avatar:auto:${code}`;

/** Idiomas com tradução completa revisada (arquivos em public/i18n/). */
export const LANGS = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'ko', name: '한국어' },
];

/** Idiomas por tradução automática do navegador (Chrome no computador). */
export const AUTO_LANGS = [
  ['ar', 'العربية'], ['bg', 'Български'], ['bn', 'বাংলা'], ['cs', 'Čeština'], ['da', 'Dansk'], ['el', 'Ελληνικά'],
  ['fi', 'Suomi'], ['he', 'עברית'], ['hi', 'हिन्दी'], ['hr', 'Hrvatski'], ['hu', 'Magyar'], ['id', 'Bahasa Indonesia'],
  ['kn', 'ಕನ್ನಡ'], ['lt', 'Lietuvių'], ['mr', 'मराठी'], ['nl', 'Nederlands'], ['no', 'Norsk'], ['pl', 'Polski'],
  ['ro', 'Română'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['sv', 'Svenska'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'],
  ['th', 'ไทย'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['vi', 'Tiếng Việt'],
].map(([code, name]) => ({ code, name, auto: true }));

const RTL = new Set(['ar', 'he']);
// Idiomas cujos nomes podem ir para os rótulos do mapa (há glifos para eles).
const MAP_SCRIPTS = new Set(['pt', 'en', 'es', 'fr', 'de', 'it', 'ru', 'ja', 'zh', 'ko']);

let lang = 'pt';
let ui = PT;
let content = { places: {}, eras: {} };

export const currentLang = () => lang;
export const mapLabelsTranslated = () => MAP_SCRIPTS.has(lang);
export const autoTranslateAvailable = () => typeof self !== 'undefined' && 'Translator' in self;

/** Texto da interface. Variáveis entre chaves: t('x', { n: 3 }). */
export function t(key, vars) {
  let s = ui[key] ?? PT[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Idioma inicial: escolha salva, senão o do navegador, senão português. */
export function initialLang() {
  const saved = storage.get(KEY, null);
  if (saved) return saved;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = String(l).toLowerCase().split('-')[0];
    if (LANGS.some((x) => x.code === code)) return code;
  }
  return 'pt';
}

/**
 * Carrega um idioma. Para idiomas automáticos usa a tradução do navegador a
 * partir do inglês (precisa de um clique do usuário na primeira vez, para
 * baixar o modelo); sem suporte, cai para o inglês.
 */
export async function loadLang(code, base, { allowDownload = false, onProgress } = {}) {
  if (code === 'pt') {
    lang = 'pt'; ui = PT; content = { places: {}, eras: {} };
  } else if (LANGS.some((l) => l.code === code)) {
    const pack = await getJSON(`${base}i18n/${code}.json`);
    lang = code; ui = pack.ui ?? {}; content = { places: pack.places ?? {}, eras: pack.eras ?? {} };
  } else {
    const pack = await getJSON(`${base}i18n/en.json`);
    const cached = storage.get(AUTO_KEY(code), null);
    const done = cached?.ver === pack.ver ? cached.pack : await autoTranslate(pack, code, { allowDownload, onProgress });
    if (!done) return loadLang('en', base);
    if (!cached || cached.ver !== pack.ver) storage.set(AUTO_KEY(code), { ver: pack.ver, pack: done });
    lang = code; ui = done.ui; content = { places: done.places, eras: done.eras };
  }
  storage.set(KEY, lang);
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  return lang;
}

async function autoTranslate(pack, target, { allowDownload, onProgress }) {
  if (!autoTranslateAvailable()) return null;
  try {
    const avail = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: target });
    if (avail === 'unavailable' || (avail !== 'available' && !allowDownload)) return null;
    const tr = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: target });
    // junta todos os textos, traduz um por um e remonta a mesma estrutura
    const jobs = [];
    const walk = (obj, keep) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && !keep(k)) jobs.push([obj, k]);
        else if (v && typeof v === 'object') walk(v, keep);
      }
    };
    const copy = structuredClone({ ui: pack.ui, places: pack.places, eras: pack.eras });
    walk(copy, (k) => k === 'name'); // nomes próprios ficam em inglês (rótulos do mapa)
    let n = 0;
    for (const [obj, k] of jobs) {
      obj[k] = await tr.translate(obj[k]);
      if (++n % 20 === 0) onProgress?.(n / jobs.length);
    }
    tr.destroy?.();
    return copy;
  } catch (err) {
    console.warn('Tradução automática indisponível', err);
    return null;
  }
}

/** Lugar com os textos no idioma atual (nomes e descrições). */
export function localizePlace(p) {
  const tr = content.places[p.id];
  if (!tr) return p;
  const eras = {};
  for (const [era, e] of Object.entries(p.eras)) eras[era] = { ...e, ...(tr.eras?.[era] ?? {}) };
  return { ...p, ...tr, eras, aka: tr.aka ?? p.aka, refs: tr.refs ?? p.refs, ptName: p.name };
}

/** Campos de texto de uma era no idioma atual. */
export function localizeEra(era) {
  return { ...era, ...(content.eras[era.id] ?? {}) };
}

/** Aplica as traduções aos textos fixos do index.html (atributos data-i18n*). */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}
