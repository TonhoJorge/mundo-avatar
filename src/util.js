// Utilitários pequenos e sem dependências.

/** Texto sem acentos e em minúsculas, para busca. */
export const normalize = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Cria um elemento DOM com segurança (texto nunca é interpretado como HTML). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** localStorage tolerante a falhas (modo privado, bloqueio de cookies etc.). */
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* sem armazenamento */ }
  },
};

/** Lê ?era=…&lugar=… da URL. */
export function readQuery() {
  const q = new URLSearchParams(location.search);
  return { era: q.get('era'), place: q.get('lugar') };
}

/** Atualiza a query string sem recarregar e sem mexer no #hash (posição do mapa). */
export function writeQuery(params) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
}

/** letters: 'NSLO' (norte, sul, leste, oeste) no idioma atual. */
export const formatCoord = (lon, lat, letters = 'NSLO') =>
  `${Math.abs(lat).toFixed(2)}° ${letters[lat >= 0 ? 0 : 1]}, ${Math.abs(lon).toFixed(2)}° ${letters[lon >= 0 ? 2 : 3]}`;

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ao carregar ${url}`);
  return res.json();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
