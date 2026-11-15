import '@fontsource/marcellus-sc/latin-400.css';
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/cyrillic-400.css';
import './style.css';
import { eraById } from './eras.js';
import { BASE, CLICKABLE_LAYERS, createMap, showEra, setLabelsVisible, setSelection, placesToGeoJSON } from './map.js';
import { renderEraNav, updateEraNav, showPlace, showEraInfo, showSheet, closePanel, setupSearch, toast, showFatal } from './ui.js';
import { createCommunity } from './community.js';
import { t, LANGS, AUTO_LANGS, initialLang, loadLang, currentLang, localizePlace, applyStatic, autoTranslateAvailable } from './i18n.js';
import { setBuildingsVisible, updateBuildings } from './buildings.js';
import { readQuery, writeQuery, storage, getJSON, formatCoord, prefersReducedMotion, copyText, h } from './util.js';

const PREFS_KEY = 'mundo-avatar:prefs';
const EDITS_KEY = 'mundo-avatar:edicoes';
const FLY_ZOOM = { region: 2.8, water: 4, 1: 4, 2: 4.6, 3: 5.2 };

const state = {
  era: 'aang',
  selected: null,
  panel: null, // 'place' | 'era' | null
  base: [],
  edits: storage.get(EDITS_KEY, {}),
  prefs: { labels: true, buildings: true, clouds: false, legacy: true, editor: false, era: null, ...storage.get(PREFS_KEY, {}) },
  photos: {},
  community: null,
  map: null,
  loaded: false,
  editor: null,
};

const $ = (sel) => document.querySelector(sel);
const savePrefs = () => storage.set(PREFS_KEY, state.prefs);

/** Catálogo efetivo (com as edições locais aplicadas quando o editor está ligado). */
function places() {
  const base = state.base.map(localizePlace);
  if (!state.prefs.editor) return base;
  return base.map((p) => (state.edits[p.id] ? { ...p, lon: state.edits[p.id][0], lat: state.edits[p.id][1] } : p));
}
const byId = (id) => places().find((p) => p.id === id);

function refreshPlaces() {
  state.map.getSource('lugares')?.setData(placesToGeoJSON(places(), state.era, { legacy: state.prefs.legacy }));
  updateBuildings(state.map, places(), state.era);
}

function panelPadding() {
  const narrow = window.innerWidth < 720;
  return narrow ? { top: 0, right: 0, left: 0, bottom: Math.round(window.innerHeight * 0.45) } : { top: 0, right: 0, bottom: 0, left: 380 };
}

function flyTo(p) {
  const zoom = FLY_ZOOM[p.type] ?? FLY_ZOOM[p.rank] ?? 4;
  const opts = { center: [p.lon, p.lat], zoom, padding: panelPadding() };
  if (prefersReducedMotion()) state.map.jumpTo(opts);
  else state.map.flyTo({ ...opts, duration: 2200 });
}

function select(id, { fly = false } = {}) {
  const p = byId(id);
  if (!p) { deselect(); return; }
  state.selected = id;
  state.panel = 'place';
  setSelection(state.map, id);
  showPlace(p, state.era, {
    photos: state.photos[id],
    extra: state.community?.placeSection(p),
    onEra: (era) => setEra(era),
    onFly: () => flyTo(p),
    onShare: () => share(p),
  });
  writeQuery({ lugar: id });
  if (fly) flyTo(p);
}

function deselect() {
  const hadPanel = state.panel !== null;
  state.selected = null;
  state.panel = null;
  setSelection(state.map, '');
  closePanel();
  writeQuery({ lugar: null });
  if (hadPanel) state.map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 300 });
}

function setEra(era) {
  if (!eraById(era)) return;
  state.era = era;
  state.prefs.era = era;
  savePrefs();
  updateEraNav($('#eras'), era);
  if (state.loaded) {
    showEra(state.map, era, state.prefs.clouds);
    refreshPlaces();
  }
  writeQuery({ era });
  if (state.panel === 'place') select(state.selected);
  else if (state.panel === 'era') showEraInfo(era);
}

async function share(p) {
  const url = `${location.origin}${location.pathname}?era=${state.era}&lugar=${encodeURIComponent(p.id)}${location.hash}`;
  toast((await copyText(url)) ? t('toast.linkCopied') : t('toast.linkFailed'));
}

async function setEditor(on) {
  state.prefs.editor = on;
  savePrefs();
  if (on && !state.editor) {
    const { startEditor } = await import('./editor.js');
    if (!state.prefs.editor) return; // desligado enquanto carregava
    state.editor = startEditor({
      map: state.map,
      getBase: () => state.base,
      getEdits: () => state.edits,
      setEdit: (id, lonLat) => {
        if (lonLat) state.edits[id] = lonLat;
        else delete state.edits[id];
        storage.set(EDITS_KEY, state.edits);
        refreshPlaces();
      },
      clearEdits: () => { state.edits = {}; storage.remove(EDITS_KEY); refreshPlaces(); },
      refresh: refreshPlaces,
      toast,
    });
  } else if (!on && state.editor) {
    state.editor.stop();
    state.editor = null;
  }
  refreshPlaces();
}

function setupLayersMenu() {
  const btn = $('#btn-camadas'), menu = $('#camadas');
  const toggleMenu = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => toggleMenu(menu.hidden));
  document.addEventListener('click', (ev) => {
    if (!menu.hidden && !menu.contains(ev.target) && !btn.contains(ev.target)) toggleMenu(false);
  });
  const bind = (key, apply) => {
    const input = menu.querySelector(`input[name="${key}"]`);
    input.checked = !!state.prefs[key];
    input.addEventListener('change', () => {
      state.prefs[key] = input.checked;
      savePrefs();
      if (state.loaded) apply(input.checked); // antes do load, o handler de 'load' aplica tudo
    });
  };
  bind('labels', (v) => setLabelsVisible(state.map, v));
  bind('buildings', (v) => setBuildingsVisible(state.map, v));
  bind('clouds', () => showEra(state.map, state.era, state.prefs.clouds));
  bind('legacy', refreshPlaces);
  bind('editor', (v) => setEditor(v));
}

function setupPointer(map) {
  const coords = $('#coords');
  let pending = null;
  map.on('mousemove', (e) => {
    if (pending) { pending = e; return; }
    pending = e;
    requestAnimationFrame(() => {
      const ev = pending;
      pending = null;
      coords.textContent = formatCoord(ev.lngLat.lng, ev.lngLat.lat, t('coord.letters'));
      coords.hidden = false;
      const hit = map.queryRenderedFeatures(ev.point, { layers: CLICKABLE_LAYERS }).length > 0;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
  });
  map.getCanvas().addEventListener('mouseleave', () => { coords.hidden = true; });
  map.on('click', (e) => {
    const { x, y } = e.point;
    const f = map.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers: CLICKABLE_LAYERS })[0];
    if (f) select(f.properties.id);
    else state.editor?.onMapClick(e);
  });
}

function setupLanguage() {
  const sel = $('#idioma');
  const opt = (l) => h('option', { value: l.code, selected: l.code === currentLang() }, l.name);
  sel.append(...LANGS.map(opt));
  if (autoTranslateAvailable() || AUTO_LANGS.some((l) => l.code === currentLang())) {
    sel.append(h('optgroup', { label: t('lang.auto') }, AUTO_LANGS.map(opt)));
  }
  sel.addEventListener('change', async () => {
    const code = sel.value;
    sel.disabled = true;
    if (AUTO_LANGS.some((l) => l.code === code)) toast(t('lang.downloading'));
    try {
      const got = await loadLang(code, BASE, { allowDownload: true, onProgress: (f) => toast(`${t('lang.downloading')} ${Math.round(f * 100)}%`) });
      if (got !== code) toast(t('lang.autoFailed'));
    } catch (err) {
      console.error(err);
    }
    location.reload(); // recomeça com tudo no novo idioma
  });
}

async function boot() {
  try {
    await loadLang(initialLang(), BASE);
  } catch (err) {
    console.error(err);
    await loadLang('pt', BASE);
  }
  applyStatic();
  setupLanguage();
  state.community = createCommunity({
    base: BASE,
    showSheet: (...c) => { state.selected = null; state.panel = 'community'; if (state.map) setSelection(state.map, ''); writeQuery({ lugar: null }); showSheet(...c); },
    toast,
    getEra: () => state.era,
    onSelectPlace: (id) => select(id, { fly: true }),
    placeName: (id) => byId(id)?.name ?? id,
  });
  $('#btn-conta').addEventListener('click', () => state.community.openAccount());
  getJSON(`${BASE}data/photos.json`).then((p) => { state.photos = p; }).catch(() => {});
  let meta, data;
  try {
    [meta, data] = await Promise.all([getJSON(`${BASE}tiles/meta.json`), getJSON(`${BASE}data/places.json`)]);
  } catch (err) {
    console.error(err);
    showFatal(t('error.load'));
    return;
  }
  state.base = data.places;
  const q = readQuery();
  const hadPosition = location.hash.includes('mapa='); // antes de o mapa reescrever o #hash
  state.era = [q.era, state.prefs.era].find((e) => eraById(e)) ?? 'aang';

  const nav = $('#eras');
  renderEraNav(nav, state.era, setEra);
  updateEraNav(nav, state.era);

  let map;
  try {
    map = state.map = createMap({ container: 'mapa', meta, era: state.era, attribution: t('map.attribution') });
  } catch (err) {
    console.error(err);
    showFatal(t('error.webgl'));
    return;
  }
  map.on('load', () => {
    state.loaded = true;
    showEra(map, state.era, state.prefs.clouds);
    setLabelsVisible(map, state.prefs.labels);
    setBuildingsVisible(map, state.prefs.buildings);
    refreshPlaces();
    writeQuery({ era: state.era });
    if (state.prefs.editor) setEditor(true);
    if (q.place && byId(q.place)) select(q.place, { fly: !hadPosition });
    else if (new URLSearchParams(location.search).has('code')) state.community.openAccount(); // volta do login
    map.once('idle', () => { document.body.dataset.pronto = '1'; }); // usado pelo teste automático
  });

  setupPointer(map);
  setupLayersMenu();
  setupSearch({
    input: $('#busca'),
    list: $('#resultados'),
    getPlaces: places,
    onPick: (p) => {
      if (!p.eras[state.era]) setEra(['aang', 'korra', 'havens'].find((e) => p.eras[e]));
      select(p.id, { fly: true });
      $('#painel-titulo')?.focus({ preventScroll: true });
    },
  });
  $('#painel').addEventListener('fechar', deselect);
  $('#btn-era').addEventListener('click', () => {
    if (state.panel === 'era') { deselect(); return; }
    state.selected = null;
    setSelection(map, '');
    writeQuery({ lugar: null });
    state.panel = 'era';
    showEraInfo(state.era);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.panel && !(ev.target instanceof HTMLInputElement)) deselect();
  });
}

boot();
