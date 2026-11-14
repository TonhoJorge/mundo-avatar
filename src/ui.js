// Interface: seletor de era, busca, painel de detalhes, camadas e avisos.

import { ERAS, eraById, NATION, TYPE_LABEL, CONF_LABEL, CANON_LABEL } from './eras.js';
import { h, normalize } from './util.js';

const $ = (sel) => document.querySelector(sel);

// --------------------------------------------------------------------------
export function renderEraNav(nav, current, onPick) {
  nav.replaceChildren(...ERAS.map((e) => h('button', {
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
    h('button', { type: 'button', class: 'fechar', 'aria-label': 'Fechar painel', onclick: () => p.dispatchEvent(new CustomEvent('fechar')) }, '×'),
    ...children.flat(Infinity).filter((c) => c != null && c !== false),
  );
  p.hidden = false;
  p.scrollTop = 0;
}

export function showPlace(place, era, { onEra, onFly, onShare }) {
  const e = place.eras[era];
  const name = e?.name ?? place.name;
  const nation = e?.nation && e.nation !== 'none' ? NATION[e.nation] : null;
  const aka = [...(e?.name && e.name !== place.name ? [place.name] : []), ...(place.aka ?? [])];
  const present = ERAS.filter((x) => place.eras[x.id]);
  const absent = !e && (era === 'havens'
    ? 'Lugar do mundo antigo. A situação dele nesta era ainda não foi revelada na série.'
    : 'Este lugar não aparece nesta era.');

  openPanel(
    h('p', { class: 'tipo' }, TYPE_LABEL[place.type] ?? place.type),
    h('h2', { id: 'painel-titulo', tabindex: '-1' }, name),
    aka.length ? h('p', { class: 'aka' }, `Também: ${aka.join(' · ')}`) : null,
    h('div', { class: 'chips' },
      nation ? h('span', { class: 'chip', style: `--cor:${nation.color}` }, nation.label) : null,
      e?.status ? h('span', { class: 'chip chip-status' }, e.status) : null),
    absent ? h('p', { class: 'ausente' }, absent) : null,
    h('p', {}, place.desc),
    e?.desc ? h('p', {}, e.desc) : null,
    present.length > 1 || absent ? h('div', { class: 'outras-eras' },
      h('p', { class: 'rotulo' }, 'Ver em outra era'),
      h('div', { class: 'chips' }, present.map((x) => h('button', {
        type: 'button', class: `chip chip-era era-${x.id}`, disabled: x.id === era,
        onclick: () => onEra(x.id),
      }, `${x.short} · ${x.years}`)))) : null,
    h('dl', { class: 'meta' },
      h('dt', {}, 'Posição'), h('dd', {}, CONF_LABEL[place.conf] ?? place.conf),
      h('dt', {}, 'Fonte'), h('dd', {}, CANON_LABEL[place.canon] ?? place.canon),
      place.refs?.length ? [h('dt', {}, 'Aparece em'), h('dd', {}, place.refs.join('; '))] : null),
    h('div', { class: 'acoes' },
      h('button', { type: 'button', onclick: onFly }, 'Centralizar'),
      h('button', { type: 'button', onclick: onShare }, 'Copiar link')),
  );
}

export function showEraInfo(eraId) {
  const e = eraById(eraId);
  openPanel(
    h('p', { class: 'tipo' }, 'Sobre esta era'),
    h('h2', { id: 'painel-titulo', tabindex: '-1' }, e.label),
    h('p', { class: 'aka' }, e.years),
    h('p', {}, e.summary),
    e.unknown ? [h('p', { class: 'rotulo' }, 'Ainda sem lugar no mapa'), h('ul', {}, e.unknown.map((u) => h('li', {}, u)))] : null,
    h('dl', { class: 'meta' }, h('dt', {}, 'Fontes'), h('dd', {}, e.sources)),
    h('p', { class: 'legal' },
      'Projeto de fã, sem fins lucrativos. Avatar: A Lenda de Aang, A Lenda de Korra e Avatar: Sete Refúgios são marcas da Nickelodeon/Paramount. ',
      'A pintura do mapa é procedural e original (salvo quando o administrador do site usa outra arte); posições marcadas como estimadas são aproximações.'),
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
      list.replaceChildren(h('li', { class: 'vazio', role: 'option', 'aria-disabled': 'true' }, 'Nenhum lugar encontrado'));
    } else {
      list.replaceChildren(...results.map((p, i) => h('li', {
        id: `resultado-${i}`, role: 'option', 'aria-selected': i === active ? 'true' : 'false',
        onclick: () => pick(i),
      },
      h('span', { class: 'r-nome' }, p.name),
      h('span', { class: 'r-tipo' }, TYPE_LABEL[p.type] ?? ''),
      h('span', { class: 'r-eras' }, ERAS.map((e) => h('i', { class: `era-${e.id}`, title: e.label, 'data-on': p.eras[e.id] ? '1' : '0' }, e.short[0]))))));
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
        const keys = [p.name, ...(p.aka ?? []), ...Object.values(p.eras).map((e) => e.name).filter(Boolean)].map(normalize);
        return { p, s: score(keys, q) };
      })
      .filter((r) => r.s < 9)
      .sort((a, b) => a.s - b.s || a.p.rank - b.p.rank || a.p.name.localeCompare(b.p.name, 'pt'))
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
