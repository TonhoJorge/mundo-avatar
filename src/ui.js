// Interface: seletor de era, busca, painel de detalhes, camadas e avisos.

import { ERAS, eraById, NATION } from './eras.js';
import { h, normalize } from './util.js';
import { t, currentLang, localizeEra } from './i18n.js';

const typeLabel = (type) => t(`type.${type}`);

const $ = (sel) => document.querySelector(sel);

// --------------------------------------------------------------------------
export function renderEraNav(nav, current, onPick) {
  nav.replaceChildren(...ERAS.map(localizeEra).map((e) => h('button', {
    type: 'button',
    class: `era era-${e.id}`,
    'data-era': e.id,
    'aria-pressed': e.id === current ? 'true' : 'false',
    title: `${e.label} (${e.years})`,
    onclick: () => onPick(e.id),
  }, h('span', { class: 'era-nome' }, e.short), h('small', {}, e.years))));
}

export function updateEraNav(nav, current) {
  for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.era === current ? 'true' : 'false');
  document.body.dataset.era = current;
}

// --------------------------------------------------------------------------
const panel = () => $('#painel');

export function closePanel() {
  panel().hidden = true;
  panel().replaceChildren();
}

function openPanel(...children) {
  const p = panel();
  p.replaceChildren(
    h('button', { type: 'button', class: 'fechar', 'aria-label': t('panel.close'), onclick: () => p.dispatchEvent(new CustomEvent('fechar')) }, '×'),
    ...children.flat(Infinity).filter((c) => c != null && c !== false),
  );
  p.hidden = false;
  p.scrollTop = 0;
}

function gallery(info) {
  if (!info?.fotos?.length) return null;
  const link = (href, ...c) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...c);
  return h('figure', { class: 'galeria' },
    h('div', { class: 'fotos' }, info.fotos.map((f) => link(f.file,
      h('img', {
        src: f.src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
        onerror: (ev) => ev.target.closest('a')?.remove(),
      })))),
    h('figcaption', {}, t('photos.credit'), ' ', link(info.wiki, t('photos.source'))));
}

/** Painel genérico (comunidade, regras, perfis…). */
export function showSheet(...children) {
  openPanel(...children);
  panel().querySelector('h2')?.focus({ preventScroll: true });
}

export function showPlace(place, era, { photos, onEra, onFly, onShare, extra }) {
  const e = place.eras[era];
  const name = e?.name ?? place.name;
  const nation = e?.nation && e.nation !== 'none' ? NATION[e.nation] : null;
  const aka = [...new Set([...(e?.name && e.name !== place.name ? [place.name] : []), ...(place.aka ?? [])])].filter((a) => a !== name);
  const present = ERAS.filter((x) => place.eras[x.id]).map(localizeEra);
  const absent = !e && t(era === 'havens' ? 'place.legacy' : 'place.absent');

  openPanel(
    h('p', { class: 'tipo' }, typeLabel(place.type)),
    h('h2', { id: 'painel-titulo', tabindex: '-1' }, name),
    aka.length ? h('p', { class: 'aka' }, t('place.aka', { names: aka.join(' · ') })) : null,
    h('div', { class: 'chips' },
      nation ? h('span', { class: 'chip', style: `--cor:${nation.color}` }, t(`nation.${e.nation}`)) : null,
      e?.status ? h('span', { class: 'chip chip-status' }, e.status) : null),
    gallery(photos),
    absent ? h('p', { class: 'ausente' }, absent) : null,
    h('p', {}, place.desc),
    e?.desc ? h('p', {}, e.desc) : null,
    present.length > 1 || absent ? h('div', { class: 'outras-eras' },
      h('p', { class: 'rotulo' }, t('place.otherEra')),
      h('div', { class: 'chips' }, present.map((x) => h('button', {
        type: 'button', class: `chip chip-era era-${x.id}`, disabled: x.id === era,
        onclick: () => onEra(x.id),
      }, `${x.short} · ${x.years}`)))) : null,
    h('dl', { class: 'meta' },
      h('dt', {}, t('place.position')), h('dd', {}, t(`conf.${place.conf}`)),
      h('dt', {}, t('place.source')), h('dd', {}, t(`canon.${place.canon}`)),
      place.refs?.length ? [h('dt', {}, t('place.appears')), h('dd', {}, place.refs.join('; '))] : null),
    h('div', { class: 'acoes' },
      h('button', { type: 'button', onclick: onFly }, t('place.center')),
      h('button', { type: 'button', onclick: onShare }, t('place.copyLink'))),
    extra ?? null,
  );
}

export function showEraInfo(eraId) {
  const e = localizeEra(eraById(eraId));
  openPanel(
    h('p', { class: 'tipo' }, t('era.about')),
    h('h2', { id: 'painel-titulo', tabindex: '-1' }, e.label),
    h('p', { class: 'aka' }, e.years),
    h('p', {}, e.summary),
    e.unknown ? [h('p', { class: 'rotulo' }, t('era.unknown')), h('ul', {}, e.unknown.map((u) => h('li', {}, u)))] : null,
    h('dl', { class: 'meta' }, h('dt', {}, t('era.sources')), h('dd', {}, e.sources)),
    h('p', { class: 'legal' }, t('era.legal')),
  );
}

// --------------------------------------------------------------------------
export function setupSearch({ input, list, getPlaces, onPick }) {
  let results = [];
  let active = -1;

  const score = (keys, q) => {
    let best = 9;
    for (const k of keys) {
      if (k.startsWith(q)) best = Math.min(best, 0);
      else if (k.includes(` ${q}`)) best = Math.min(best, 1);
      else if (k.includes(q)) best = Math.min(best, 2);
    }
    return best;
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const render = () => {
    if (!results.length) {
      list.replaceChildren(h('li', { class: 'vazio', role: 'option', 'aria-disabled': 'true' }, t('search.none')));
    } else {
      list.replaceChildren(...results.map((p, i) => h('li', {
        id: `resultado-${i}`, role: 'option', 'aria-selected': i === active ? 'true' : 'false',
        onclick: () => pick(i),
      },
      h('span', { class: 'r-nome' }, p.name),
      h('span', { class: 'r-tipo' }, typeLabel(p.type)),
      h('span', { class: 'r-eras' }, ERAS.map(localizeEra).map((e) => h('i', { class: `era-${e.id}`, title: e.label, 'data-on': p.eras[e.id] ? '1' : '0' }, e.short[0]))))));
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `resultado-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const pick = (i) => {
    const p = results[i];
    if (!p) return;
    close();
    input.value = p.name;
    input.blur();
    onPick(p);
  };

  input.addEventListener('input', () => {
    const q = normalize(input.value);
    if (!q) { results = []; close(); return; }
    results = getPlaces()
      .map((p) => {
        const keys = [p.name, p.ptName, ...(p.aka ?? []), ...Object.values(p.eras).map((e) => e.name).filter(Boolean)].filter(Boolean).map(normalize);
        return { p, s: score(keys, q) };
      })
      .filter((r) => r.s < 9)
      .sort((a, b) => a.s - b.s || a.p.rank - b.p.rank || a.p.name.localeCompare(b.p.name, currentLang()))
      .slice(0, 8)
      .map((r) => r.p);
    active = results.length ? 0 : -1;
    render();
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { close(); return; }
    if (list.hidden || !results.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      render();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      pick(Math.max(0, active));
    }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault()); // mantém o foco no campo
  input.addEventListener('blur', close);
  input.addEventListener('focus', () => { if (input.value && results.length) render(); });
}

// --------------------------------------------------------------------------
let toastTimer = 0;
export function toast(msg) {
  const el = $('#aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export function showFatal(msg) {
  const el = $('#erro');
  el.textContent = msg;
  el.hidden = false;
}
