// Comunidade: login, perfil (@nome, foto, credibilidade, atividade),
// notificações, contribuições por lugar, votação (aprovar / refutar com
// justificativa), regras e ouvidoria. Todas as regras são aplicadas no banco
// (supabase/schema.sql); aqui é só a tela.

import { h } from './util.js';
import { t, currentLang } from './i18n.js';

const DEFAULTS = {
  cred_start: 5, cred_max: 10, gain_approved: 0.1, loss_refuted: 0.1, gain_just: 0.01, loss_just: 0.01,
  vote_min_cred: 3, vote_min_days: 7, limit1_below: 2, limit1_days: 30, limit2_below: 1, limit2_days: 90,
  perse_window_days: 90, perse_min_refutes: 5, perse_share: 0.5, perse_reverted_share: 0.5,
  report_strikes: 3, report_block_days: 90, zero_recover_days: 180, zero_recover_to: 2,
};
const MENTION = /@([A-Za-z0-9_]{3,20})/g;
const USERNAME = /^[a-z0-9_]{3,20}$/;

export function createCommunity({ base, showSheet, toast, getEra, onSelectPlace, placeName, headerEl }) {
  let cfg = null; // { url, anonKey, providers, email }
  let sb = null;
  let user = null; // perfil público + preferências de quem está logado
  let rules = { ...DEFAULTS };
  let ready = null;
  let unread = 0;
  let highlight = null; // contribuição a destacar quando o painel do lugar abrir
  let channel = null;

  const fmtNum = (n) => Number(n).toLocaleString(currentLang(), { maximumFractionDigits: 2 });
  const fmtCred = (n) => Number(n).toLocaleString(currentLang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const R = () => Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, fmtNum(v)]));
  const fmtDate = (d) => new Date(d).toLocaleDateString(currentLang(), { day: 'numeric', month: 'short', year: 'numeric' });
  const ago = (d) => {
    const s = (new Date(d) - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(currentLang(), { numeric: 'auto' });
    for (const [unit, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
    }
    return rtf.format(0, 'second');
  };
  const errText = (e) => {
    const code = /([a-z_0-9]+)/.exec(e?.message ?? '')?.[1];
    const k = `err.${code}`;
    return t(k) !== k ? t(k, R()) : t('err.generic');
  };
  /** Monta um texto traduzido trocando {chaves} por elementos (nomes em negrito etc.). */
  const fill = (template, parts) => template.split(/(\{[a-z]+\})/).map((s) => {
    const k = /^\{([a-z]+)\}$/.exec(s)?.[1];
    return k && k in parts ? parts[k] : s;
  });

  // ------------------------------------------------------------ conexão
  async function loadConfig() {
    if (cfg !== null) return !!(cfg?.url && cfg?.anonKey);
    try {
      const res = await fetch(`${base}data/community.json`, { cache: 'no-cache' });
      cfg = res.ok ? await res.json() : false;
    } catch { cfg = false; }
    return !!(cfg?.url && cfg?.anonKey);
  }

  const hasStoredSession = () => {
    try { return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')); } catch { return false; }
  };

  /** Carrega a biblioteca e a sessão só quando a comunidade é usada. */
  function init() {
    ready ??= (async () => {
      if (!(await loadConfig())) return false;
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(cfg.url, cfg.anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
      const { data } = await sb.from('config').select('key,value');
      for (const r of data ?? []) rules[r.key] = Number(r.value);
      await refreshUser();
      sb.auth.onAuthStateChange((ev) => {
        if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => refreshUser().then(renderHeader), 0);
      });
      const u = new URL(location.href);
      const authError = u.searchParams.get('error_description');
      if (authError) toast(t('acc.loginError', { msg: authError }));
      for (const k of ['code', 'error', 'error_code', 'error_description']) u.searchParams.delete(k);
      history.replaceState(history.state, '', u);
      renderHeader();
      return true;
    })();
    return ready;
  }

  async function refreshUser() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { user = null; stopRealtime(); unread = 0; return; }
    const [{ data: pub }, { data: prefs }] = await Promise.all([
      sb.from('public_profiles').select('*').eq('id', session.user.id).maybeSingle(),
      sb.from('profiles').select('notify_approve,notify_refute,notify_mention').eq('id', session.user.id).maybeSingle(),
    ]);
    const wasLogged = !!user;
    user = pub ? { ...pub, ...(prefs ?? {}), credibility: Number(pub.credibility) } : null;
    if (user) {
      await refreshUnread();
      startRealtime();
      if (!wasLogged && new URLSearchParams(location.search).has('code')) toast(t('acc.welcome', { u: user.username }));
    }
  }

  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  // ------------------------------------------------------------ notificações (contagem e tempo real)
  async function refreshUnread() {
    if (!user) return;
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    unread = count ?? 0;
    renderBadge();
  }

  function startRealtime() {
    if (channel || !user) return;
    channel = sb.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        unread += 1;
        renderBadge();
        toast(t('notif.arrived'));
      })
      .subscribe();
  }
  function stopRealtime() {
    if (channel) sb.removeChannel(channel);
    channel = null;
  }
  // se o tempo real cair, a contagem ainda se atualiza ao voltar para a aba e a cada 2 minutos
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshUnread(); });
  setInterval(() => { if (!document.hidden) refreshUnread(); }, 120000);

  // ------------------------------------------------------------ cabeçalho (canto superior direito)
  const badgeText = (n) => (n > 99 ? '99+' : String(n));

  function avatar(p, size = 32) {
    const name = p?.name || p?.username || '?';
    const box = h('span', { class: 'avatar', style: `--tam:${size}px`, 'aria-hidden': 'true' });
    if (p?.avatar_url) box.append(h('img', { src: p.avatar_url, alt: '', loading: 'lazy', onerror: (ev) => ev.target.remove() }));
    box.prepend(h('span', { class: 'iniciais' }, name.trim().slice(0, 1).toUpperCase()));
    return box;
  }

  let menuOpen = false;
  function renderHeader() {
    if (!headerEl) return;
    if (!cfg?.url) { headerEl.hidden = true; return; }
    headerEl.hidden = false;
    if (!user) {
      headerEl.replaceChildren(h('button', { type: 'button', class: 'botao entrar', onclick: () => openAccount() }, t('acc.login')));
      return;
    }
    const bell = h('button', {
      type: 'button', class: 'icone sino', onclick: () => openNotifications(),
      'aria-label': unread ? `${t('acc.notifications')}: ${t('acc.unread', { n: unread })}` : t('acc.notifications'),
    }, h('span', { class: 'sino-icone', 'aria-hidden': 'true' }), h('span', { class: 'contador', hidden: !unread }, badgeText(unread)));
    bell.querySelector('.sino-icone').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>';
    const menu = h('div', { class: 'menu-conta', role: 'menu', hidden: !menuOpen, id: 'menu-conta' },
      h('div', { class: 'menu-topo' }, avatar(user, 40), h('div', {},
        h('strong', {}, user.name), h('span', { class: 'arroba' }, `@${user.username}`),
        h('span', { class: 'cred' }, `★ ${fmtCred(user.credibility)}`))),
      ...[
        ['acc.myProfile', () => openProfile(user.id)],
        ['acc.notifications', () => openNotifications()],
        ['com.rules', () => openRules()],
        ['com.ombudsman', () => openOmbudsman()],
        ['com.logout', async () => { await sb.auth.signOut(); user = null; stopRealtime(); renderHeader(); toast(t('acc.loggedOut')); }],
      ].map(([k, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, t(k))));
    const me = h('button', {
      type: 'button', class: 'icone eu', 'aria-haspopup': 'menu', 'aria-expanded': String(menuOpen), 'aria-controls': 'menu-conta',
      'aria-label': t('acc.menu'), onclick: () => (menuOpen ? closeMenu() : openMenu()),
    }, avatar(user, 34));
    headerEl.replaceChildren(bell, me, menu);
  }
  function renderBadge() {
    const c = headerEl?.querySelector('.contador');
    if (!c) return;
    c.textContent = badgeText(unread);
    c.hidden = !unread;
    headerEl.querySelector('.sino').setAttribute('aria-label', unread ? `${t('acc.notifications')}: ${t('acc.unread', { n: unread })}` : t('acc.notifications'));
  }
  function openMenu() {
    menuOpen = true;
    renderHeader();
    headerEl.querySelector('[role="menuitem"]')?.focus();
  }
  function closeMenu(focusButton = false) {
    if (!menuOpen) return;
    menuOpen = false;
    renderHeader();
    if (focusButton) headerEl.querySelector('.eu')?.focus();
  }
  headerEl?.addEventListener('keydown', (ev) => {
    if (!menuOpen) return;
    const items = [...headerEl.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(true); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });
  document.addEventListener('click', (ev) => { if (menuOpen && !headerEl.contains(ev.target)) closeMenu(); });

  /** Na abertura do site: mostra "Entrar" ou o perfil sem carregar nada pesado à toa. */
  async function boot() {
    if (!(await loadConfig())) return;
    if (hasStoredSession() || new URLSearchParams(location.search).has('code')) await init();
    else renderHeader();
  }

  // ------------------------------------------------------------ pedaços de tela
  const credBadge = (c) => h('span', { class: 'cred', title: t('com.credibility') }, `★ ${fmtCred(c)}`);
  const link = (text, onclick) => h('button', { type: 'button', class: 'link', onclick }, text);

  /** Texto de uma publicação com as @menções viram links para o perfil. */
  function richText(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(MENTION)) {
      out.push(text.slice(last, m.index));
      const u = m[1].toLowerCase();
      out.push(link(`@${u}`, () => openProfileByUsername(u)));
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }

  /** Sugestões de @nome enquanto a pessoa digita (setas, Enter ou Tab escolhem). */
  function withMentions(textarea) {
    const list = h('ul', { class: 'sugestoes-mencao', role: 'listbox', hidden: true });
    let items = [];
    let active = 0;
    let timer = 0;
    const current = () => /(^|\s)@([A-Za-z0-9_]{1,20})$/.exec(textarea.value.slice(0, textarea.selectionStart));
    const close = () => { list.hidden = true; items = []; };
    const pick = (u) => {
      const m = current();
      if (!m) return;
      const start = textarea.selectionStart - m[2].length;
      textarea.setRangeText(`${u} `, start, textarea.selectionStart, 'end');
      textarea.focus();
      close();
    };
    const render = () => {
      list.replaceChildren(...items.map((p, i) => h('li', {
        role: 'option', 'aria-selected': String(i === active),
        onmousedown: (ev) => { ev.preventDefault(); pick(p.username); },
      }, avatar(p, 20), h('strong', {}, `@${p.username}`), ' ', h('span', {}, p.name))));
      list.hidden = !items.length;
    };
    textarea.addEventListener('input', () => {
      clearTimeout(timer);
      const m = current();
      if (!m) { close(); return; }
      timer = setTimeout(async () => {
        const { data } = await sb.from('public_profiles').select('id,name,username,avatar_url').ilike('username', `${m[2].toLowerCase()}%`).limit(5);
        items = data ?? [];
        active = 0;
        render();
      }, 200);
    });
    textarea.addEventListener('keydown', (ev) => {
      if (list.hidden) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        render();
      } else if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        pick(items[active].username);
      } else if (ev.key === 'Escape') { close(); }
    });
    textarea.addEventListener('blur', () => setTimeout(close, 150));
    return h('div', { class: 'com-mencao' }, textarea, list);
  }

  function notReady() {
    return [
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('com.title')),
      h('p', {}, t('com.soon')),
      h('div', { class: 'acoes' }, h('button', { type: 'button', onclick: () => openRules() }, t('com.rules'))),
    ];
  }

  function limitsNote(c = user?.credibility ?? rules.cred_start) {
    if (c <= 0) return t('com.limit0', R());
    if (c < rules.limit2_below) return t('com.limit2', R());
    if (c < rules.limit1_below) return t('com.limit1', R());
    if (c < rules.vote_min_cred) return t('com.noVote', R());
    return t('com.allOk');
  }

  // ------------------------------------------------------------ conta / login
  async function openAccount() {
    showSheet(h('p', { class: 'carregando' }, t('com.loading')));
    if (!(await init())) { showSheet(...notReady()); return; }
    if (user) { openProfile(user.id); return; }
    showSheet(...loginView());
  }

  function loginView() {
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'voce@exemplo.com' });
    const redirect = `${location.origin}${location.pathname}${location.search}`;
    const providers = (cfg.providers ?? ['github']).map((p) => h('button', {
      type: 'button', class: 'principal',
      onclick: async () => {
        const { error } = await sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: redirect } });
        if (error) toast(errText(error));
      },
    }, t('com.loginWith', { provider: p === 'github' ? 'GitHub' : p === 'google' ? 'Google' : p })));
    return [
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('com.title')),
      h('p', {}, t('com.loginIntro', R())),
      h('div', { class: 'acoes' }, providers),
      cfg.email === false ? null : h('form', {
        class: 'linha', onsubmit: async (ev) => {
          ev.preventDefault();
          const { error } = await sb.auth.signInWithOtp({ email: email.value, options: { emailRedirectTo: redirect } });
          toast(error ? errText(error) : t('com.checkEmail'));
        },
      }, h('label', {}, t('com.email'), email), h('button', { type: 'submit' }, t('com.sendLink'))),
      h('div', { class: 'acoes' }, h('button', { type: 'button', onclick: () => openRules() }, t('com.rules'))),
    ];
  }

  // ------------------------------------------------------------ perfil (próprio e de outras pessoas)
  async function openProfileByUsername(username) {
    if (!(await init())) return;
    const { data } = await sb.from('public_profiles').select('id').eq('username', username).maybeSingle();
    if (data) openProfile(data.id);
    else toast(t('mention.none'));
  }

  async function openProfile(id) {
    showSheet(h('p', { class: 'carregando' }, t('com.loading')));
    if (!(await init())) { showSheet(...notReady()); return; }
    const mine = user?.id === id;
    const [{ data: p }, { data: acts }, { data: posts }] = await Promise.all([
      sb.from('public_profiles').select('*').eq('id', id).maybeSingle(),
      sb.from('activity').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(300),
      sb.from('contribution_list').select('id,kind,outcome,created_at').eq('author', id).limit(500),
    ]);
    if (!p) { showSheet(h('p', {}, t('err.not_found'))); return; }
    const outcomeOf = new Map((posts ?? []).map((c) => [c.id, c]));
    const cred = Number(p.credibility);

    // efeito de cada publicação na credibilidade (transparência)
    const effect = (a) => {
      const c = outcomeOf.get(a.contribution_id);
      if (!c || (a.kind !== 'post' && a.kind !== 'refute_text')) return null;
      if (p.cred_reset_at && c.created_at < p.cred_reset_at) return h('span', { class: 'efeito' }, t('com.beforeReset'));
      const just = c.kind === 'justificativa';
      const v = c.outcome > 0 ? `+${fmtNum(just ? rules.gain_just : rules.gain_approved)}` : c.outcome < 0 ? `−${fmtNum(just ? rules.loss_just : rules.loss_refuted)}` : '0';
      return h('span', { class: `efeito efeito-${Math.sign(c.outcome)}`, title: t('com.effect') }, v);
    };

    const groups = { all: () => true, posts: (a) => a.kind === 'post' || a.kind === 'refute_text', approvals: (a) => a.kind === 'approve', refutations: (a) => a.kind === 'refute' || a.kind === 'refute_text' };
    const labels = { all: 'prof.all', posts: 'prof.posts', approvals: 'prof.approvals', refutations: 'prof.refutations' };
    const listBox = h('ul', { class: 'atividades', 'aria-live': 'polite' });
    const tabs = h('div', { class: 'abas', role: 'tablist', 'aria-label': t('prof.activity') });
    const showGroup = (g) => {
      for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.g === g));
      const items = (acts ?? []).filter(groups[g]);
      listBox.replaceChildren(...(items.length ? items.map((a) => h('li', {},
        h('button', { type: 'button', class: `atividade act-${a.kind}`, onclick: () => goTo(a.place_id, a.contribution_id) },
          h('span', { class: 'act-texto' }, fill(t(`act.${a.kind}`), { place: h('strong', {}, placeName(a.place_id)) })),
          h('span', { class: 'trecho' }, a.body.slice(0, 120)),
          h('span', { class: 'quando' }, h('time', { datetime: a.created_at, title: fmtDate(a.created_at) }, ago(a.created_at)), ' ', effect(a))))) : [h('li', { class: 'vazio' }, t('prof.noActivity'))]));
    };
    tabs.append(...Object.keys(groups).map((g) => h('button', {
      type: 'button', role: 'tab', 'data-g': g, onclick: () => showGroup(g),
    }, t(labels[g]), ' ', h('span', { class: 'qtd' }, String((acts ?? []).filter(groups[g]).length)))));
    showGroup('all');

    const pct = Math.max(0, Math.min(100, (cred / rules.cred_max) * 100));
    showSheet(
      h('p', { class: 'tipo' }, t(mine ? 'acc.myProfile' : 'com.profile')),
      h('div', { class: 'perfil-topo' },
        mine ? photoEditor(p) : avatar(p, 72),
        h('div', {},
          h('h2', { id: 'painel-titulo', tabindex: '-1' }, p.name),
          h('p', { class: 'arroba' }, `@${p.username}`),
          h('p', { class: 'dica' }, t('com.memberSince', { date: fmtDate(p.created_at) })))),
      p.banned ? h('p', { class: 'ausente' }, p.ban_reason ?? t('com.banned')) : null,
      h('section', { class: 'cartao-cred', 'aria-label': t('prof.credTitle') },
        h('div', { class: 'cred-linha' }, h('span', { class: 'cred-grande' }, `★ ${fmtCred(cred)}`), h('span', { class: 'dica' }, t('prof.of10', { max: fmtNum(rules.cred_max) }))),
        h('div', { class: 'barra', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(rules.cred_max), 'aria-valuenow': String(cred), 'aria-label': t('prof.credTitle') },
          h('span', { style: `width:${pct}%` })),
        h('p', { class: 'dica' }, mine ? limitsNote(cred) : t('com.historyNote'))),
      mine ? profileForm(p) : null,
      mine ? notifyForm() : null,
      h('h3', {}, t('prof.activity')), tabs, listBox,
      h('div', { class: 'acoes' },
        mine ? null : (user ? h('button', { type: 'button', onclick: () => openOmbudsman(id, p.name) }, t('com.reportUser')) : null),
        h('button', { type: 'button', onclick: () => openRules() }, t('com.rules')),
        mine ? h('button', { type: 'button', onclick: async () => { await sb.auth.signOut(); user = null; stopRealtime(); renderHeader(); openAccount(); } }, t('com.logout')) : null),
    );
  }

  function photoEditor(p) {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id: 'foto-perfil' });
    const shown = avatar(p, 72);
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const blob = await squareWebp(f, 256);
        const path = `${user.id}/avatar-${Date.now()}.webp`;
        const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (error) throw error;
        const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        await rpc('set_profile', { p_name: user.name, p_username: user.username, p_avatar: url });
        await refreshUser();
        renderHeader();
        toast(t('prof.photoSaved'));
        openProfile(user.id);
      } catch (e) {
        console.error(e);
        toast(t('prof.photoError'));
      }
    });
    return h('div', { class: 'foto-editar' }, shown,
      h('label', { for: 'foto-perfil', class: 'link', tabindex: '0', role: 'button', onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); file.click(); } } }, t('prof.photo')),
      file);
  }

  /** Corta a imagem no centro em quadrado e reduz para size×size (WebP leve). */
  async function squareWebp(f, size) {
    const img = await createImageBitmap(f);
    const s = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    img.close();
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.85));
    if (!blob) throw new Error('webp');
    return blob;
  }

  function profileForm(p) {
    const name = h('input', { type: 'text', value: p.name, minlength: '2', maxlength: '40', required: true, autocomplete: 'nickname' });
    const uname = h('input', {
      type: 'text', value: p.username, minlength: '3', maxlength: '20', required: true, autocomplete: 'username',
      spellcheck: 'false', autocapitalize: 'none', 'aria-describedby': 'arroba-status arroba-dica',
    });
    const status = h('span', { id: 'arroba-status', class: 'status-campo', 'aria-live': 'polite' });
    const save = h('button', { type: 'submit' }, t('com.save'));
    let timer = 0;
    let ok = true;
    uname.addEventListener('input', () => {
      uname.value = uname.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
      clearTimeout(timer);
      const v = uname.value;
      if (v === p.username) { status.textContent = ''; status.dataset.ok = ''; ok = true; save.disabled = false; return; }
      if (!USERNAME.test(v)) { status.textContent = t('prof.invalid'); status.dataset.ok = 'no'; ok = false; save.disabled = true; return; }
      status.textContent = '…';
      timer = setTimeout(async () => {
        const free = await rpc('username_available', { p_username: v }).catch(() => false);
        if (uname.value !== v) return;
        ok = !!free;
        status.textContent = t(free ? 'prof.available' : 'prof.taken');
        status.dataset.ok = free ? 'yes' : 'no';
        save.disabled = !free;
      }, 350);
    });
    return h('form', {
      class: 'coluna', onsubmit: async (ev) => {
        ev.preventDefault();
        if (!ok) return;
        try {
          await rpc('set_profile', { p_name: name.value, p_username: uname.value, p_avatar: null });
          await refreshUser();
          renderHeader();
          toast(t('com.saved'));
          openProfile(user.id);
        } catch (e) { toast(errText(e)); }
      },
    },
    h('label', {}, t('com.name'), name),
    h('label', {}, t('prof.username'), h('span', { class: 'campo-arroba' }, h('span', { 'aria-hidden': 'true' }, '@'), uname), status),
    h('span', { id: 'arroba-dica', class: 'dica' }, t('prof.usernameHint')),
    save);
  }

  function notifyForm() {
    const box = (key, label) => {
      const input = h('input', { type: 'checkbox', checked: user[key] !== false });
      input.addEventListener('change', async () => {
        const prefs = { notify_approve: user.notify_approve, notify_refute: user.notify_refute, notify_mention: user.notify_mention, [key]: input.checked };
        try {
          await rpc('set_notify', { p_approve: prefs.notify_approve, p_refute: prefs.notify_refute, p_mention: prefs.notify_mention });
          Object.assign(user, prefs);
          toast(t('com.saved'));
        } catch (e) { input.checked = !input.checked; toast(errText(e)); }
      });
      return h('label', { class: 'opcao' }, input, ' ', t(label));
    };
    return h('fieldset', { class: 'preferencias', id: 'preferencias-notif' },
      h('legend', {}, t('prof.notifTitle')),
      box('notify_approve', 'prof.notifApprove'),
      box('notify_refute', 'prof.notifRefute'),
      box('notify_mention', 'prof.notifMention'));
  }

  function goTo(placeId, contributionId) {
    highlight = contributionId;
    onSelectPlace(placeId);
  }

  // ------------------------------------------------------------ painel de notificações
  async function openNotifications() {
    showSheet(h('p', { class: 'carregando' }, t('com.loading')));
    if (!(await init()) || !user) { openAccount(); return; }
    const { data } = await sb.from('notifications')
      .select('id,kind,created_at,read_at,contribution_id,actor:profiles!notifications_actor_fkey(name,username,avatar_url),item:contributions!notifications_contribution_id_fkey(place_id,body,kind)')
      .order('created_at', { ascending: false }).limit(60);
    const list = data ?? [];
    unread = list.filter((n) => !n.read_at).length > unread ? list.filter((n) => !n.read_at).length : unread;
    const row = (n) => h('li', {},
      h('button', {
        type: 'button', class: `notificacao${n.read_at ? '' : ' nao-lida'}`,
        onclick: async () => {
          if (!n.read_at) { await rpc('mark_read', { p_ids: [n.id] }).catch(() => {}); unread = Math.max(0, unread - 1); renderBadge(); }
          goTo(n.item?.place_id, n.contribution_id);
        },
      },
      avatar(n.actor, 36),
      h('span', { class: 'notif-corpo' },
        h('span', { class: 'notif-texto' }, fill(t(`notif.${n.kind}`), {
          actor: h('strong', {}, `@${n.actor?.username ?? '?'}`),
          place: h('strong', {}, placeName(n.item?.place_id)),
        })),
        h('span', { class: 'trecho' }, (n.item?.body ?? '').slice(0, 100)),
        h('time', { datetime: n.created_at, title: fmtDate(n.created_at) }, ago(n.created_at))),
      n.read_at ? null : h('span', { class: 'ponto', 'aria-label': t('notif.unreadOne') })));
    const fresh = list.filter((n) => !n.read_at);
    const old = list.filter((n) => n.read_at);
    showSheet(
      h('p', { class: 'tipo' }, t('tools.account')),
      h('div', { class: 'linha-titulo' },
        h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('notif.title')),
        h('button', {
          type: 'button', class: 'link', disabled: !fresh.length,
          onclick: async () => { try { await rpc('mark_read', { p_ids: null }); unread = 0; renderBadge(); openNotifications(); } catch (e) { toast(errText(e)); } },
        }, t('notif.markAll'))),
      list.length ? null : h('p', { class: 'vazio' }, t('notif.empty')),
      fresh.length ? [h('h3', {}, t('notif.new')), h('ul', { class: 'notificacoes' }, fresh.map(row))] : null,
      old.length ? [h('h3', {}, t('notif.earlier')), h('ul', { class: 'notificacoes' }, old.map(row))] : null,
      h('p', { class: 'dica' }, link(t('notif.settings'), () => openProfile(user.id).then(() => document.getElementById('preferencias-notif')?.scrollIntoView({ block: 'center' })))),
    );
    renderBadge();
  }

  // ------------------------------------------------------------ regras
  async function openRules() {
    if (await loadConfig()) await init();
    const r = R();
    const li = (k) => h('li', {}, t(k, r));
    showSheet(
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('rules.title')),
      h('p', {}, t('rules.intro')),
      h('h3', {}, t('rules.credTitle')), h('ul', {}, ['rules.cred1', 'rules.cred2', 'rules.cred3', 'rules.cred4', 'rules.cred5'].map(li)),
      h('h3', {}, t('rules.voteTitle')), h('ul', {}, ['rules.vote1', 'rules.vote2', 'rules.vote3', 'rules.vote4', 'rules.vote5'].map(li)),
      h('h3', {}, t('rules.limitTitle')), h('ul', {}, ['rules.limit1', 'rules.limit2', 'rules.limit3'].map(li)),
      h('h3', {}, t('rules.ombTitle')), h('p', {}, t('rules.omb0', r)),
      h('ol', {}, ['rules.omb1', 'rules.omb2', 'rules.omb3'].map(li)),
      h('ul', {}, ['rules.omb4', 'rules.omb5', 'rules.omb6'].map(li)),
      h('h3', {}, t('rules.devTitle')), h('ul', {}, ['rules.dev1', 'rules.dev2', 'rules.dev3', 'rules.dev4'].map(li)),
      h('h3', {}, t('rules.transpTitle')), h('ul', {}, ['rules.transp1', 'rules.transp2', 'rules.transp3'].map(li)),
    );
  }

  // ------------------------------------------------------------ ouvidoria
  async function openOmbudsman(accusedId, accusedName) {
    if (!(await init())) { showSheet(...notReady()); return; }
    const { data: reports } = await sb.from('public_reports').select('*').order('created_at', { ascending: false }).limit(30);
    const text = h('textarea', { rows: '4', minlength: '10', maxlength: '2000', required: true, placeholder: t('omb.placeholder') });
    let accused = accusedId ?? null;
    const who = h('input', { type: 'text', placeholder: t('omb.whoPlaceholder'), value: accusedName ?? '' });
    const found = h('ul', { class: 'sugestoes' });
    who.addEventListener('input', async () => {
      accused = null;
      const q = who.value.trim().replace(/^@/, '');
      if (q.length < 2) { found.replaceChildren(); return; }
      const { data } = await sb.from('public_profiles').select('id,name,username').or(`name.ilike.%${q}%,username.ilike.%${q}%`).limit(6);
      found.replaceChildren(...(data ?? []).filter((u) => u.id !== user?.id).map((u) => h('li', {}, link(`${u.name} (@${u.username})`, () => { accused = u.id; who.value = u.name; found.replaceChildren(); }))));
    });
    showSheet(
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('com.ombudsman')),
      h('p', {}, t('omb.intro', R())),
      user ? h('form', {
        class: 'coluna', onsubmit: async (ev) => {
          ev.preventDefault();
          if (!accused) { toast(t('omb.pickUser')); return; }
          try {
            const r = await rpc('report', { p_accused: accused, p_text: text.value });
            toast(r.confirmed ? t('omb.confirmed') : t('omb.archived'));
            openOmbudsman();
          } catch (e) { toast(errText(e)); }
        },
      }, h('label', {}, t('omb.who'), who), found, h('label', {}, t('omb.what'), text), h('button', { type: 'submit' }, t('omb.send')))
        : h('p', { class: 'dica' }, t('com.loginToReport')),
      h('h3', {}, t('omb.public')),
      reports?.length ? h('ul', { class: 'denuncias' }, reports.map((r) => h('li', { 'data-status': r.status },
        h('strong', {}, t(`omb.status.${r.status}`)), ' · ', r.accused_name, ' · ', fmtDate(r.created_at), h('br'),
        h('small', {}, t('omb.numbers', r))))) : h('p', {}, t('omb.none')),
    );
  }

  // ------------------------------------------------------------ contribuições de um lugar
  function placeSection(place) {
    const box = h('section', { class: 'comunidade', 'aria-label': t('com.section') }, h('h3', {}, t('com.section')));
    renderPlace(box, place);
    return box;
  }

  async function renderPlace(box, place) {
    const head = box.firstChild;
    if (!(await init())) {
      box.replaceChildren(head, h('p', { class: 'dica' }, t('com.soon')));
      return;
    }
    const { data: items, error } = await sb.from('contribution_list').select('*').eq('place_id', place.id).order('created_at').limit(500);
    if (error) { box.replaceChildren(head, h('p', { class: 'dica' }, t('err.generic'))); return; }
    const ids = items.map((c) => c.id);
    const authors = [...new Set(items.map((c) => c.author))];
    const [{ data: mine }, { data: profs }] = await Promise.all([
      user && ids.length ? sb.from('votes').select('contribution_id,value').eq('voter', user.id).in('contribution_id', ids) : { data: [] },
      authors.length ? sb.from('public_profiles').select('id,credibility').in('id', authors) : { data: [] },
    ]);
    const myVote = new Map((mine ?? []).map((v) => [v.contribution_id, v.value]));
    const credOf = new Map((profs ?? []).map((p) => [p.id, Number(p.credibility)]));
    const kids = new Map();
    for (const c of items) if (c.parent_id) kids.set(c.parent_id, [...(kids.get(c.parent_id) ?? []), c]);
    const rerender = () => renderPlace(box, place);

    const item = (c, depth = 0) => {
      const own = user?.id === c.author;
      const vote = myVote.get(c.id);
      const ta = h('textarea', { name: 'j', rows: '3', minlength: '10', maxlength: '2000', required: true, placeholder: t('com.justify') });
      const refuteBox = h('form', {
        class: 'coluna refutar', hidden: true, onsubmit: async (ev) => {
          ev.preventDefault();
          try { await rpc('vote', { p_id: c.id, p_value: -1, p_justification: ta.value }); await refreshUser(); renderHeader(); rerender(); } catch (e) { toast(errText(e)); }
        },
      }, withMentions(ta), h('button', { type: 'submit' }, t('com.sendRefute')));
      const actions = !user || own || user.banned ? null : h('div', { class: 'votar' },
        vote ? [h('span', { class: 'dica' }, t(vote > 0 ? 'com.youApproved' : 'com.youRefuted')),
          link(t('com.unvote'), async () => { try { await rpc('unvote', { p_id: c.id }); rerender(); } catch (e) { toast(errText(e)); } })] : null,
        vote > 0 ? null : h('button', { type: 'button', onclick: async () => { try { await rpc('vote', { p_id: c.id, p_value: 1 }); rerender(); } catch (e) { toast(errText(e)); } } }, `✔ ${t('com.approve')}`),
        vote < 0 ? null : h('button', { type: 'button', onclick: () => { refuteBox.hidden = !refuteBox.hidden; if (!refuteBox.hidden) ta.focus(); } }, `✖ ${t('com.refute')}`));
      const replies = (kids.get(c.id) ?? []);
      return h('article', { class: `contrib nivel-${Math.min(depth, 3)}`, 'data-outcome': c.outcome, 'data-id': c.id },
        h('header', {},
          avatar({ name: c.author_name, avatar_url: c.author_avatar }, 22),
          link(c.author_name, () => openProfile(c.author)),
          h('span', { class: 'arroba' }, `@${c.author_username}`), credBadge(credOf.get(c.author) ?? rules.cred_start), ' · ',
          h('strong', {}, t(depth ? 'kind.refutacao' : `kind.${c.kind}`)), ' · ',
          h('time', { datetime: c.created_at, title: fmtDate(c.created_at) }, ago(c.created_at)),
          c.era && !depth ? h('span', { class: 'chip chip-mini' }, c.era) : null),
        h('p', { class: 'texto' }, richText(c.body)),
        c.image_url && c.kind === 'foto' ? h('a', { href: c.image_url, target: '_blank', rel: 'noopener noreferrer' },
          h('img', {
            src: c.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', class: 'foto-contrib',
            // link que não é imagem (ex.: página do Instagram): mostra o link em vez de um quadro quebrado
            onerror: (ev) => ev.target.replaceWith(h('span', { class: 'link-externo' }, `🔗 ${t('com.openLink')}`)),
          })) : null,
        h('footer', {},
          h('span', { class: 'placar' }, `✔ ${c.approvals} · ✖ ${c.refutes}`), ' ',
          h('span', { class: 'estado' }, t(c.outcome > 0 ? 'com.stApproved' : c.outcome < 0 ? 'com.stRefuted' : 'com.stTie')),
          actions),
        refuteBox,
        replies.length ? h('div', { class: 'respostas' }, replies.map((r) => item(r, depth + 1))) : null);
    };

    const top = items.filter((c) => !c.parent_id);
    const visible = top.filter((c) => c.outcome >= 0);
    const refuted = top.filter((c) => c.outcome < 0);
    const refutedBox = refuted.length ? h('details', { class: 'refutadas' }, h('summary', {}, t('com.refutedList', { n: refuted.length })), refuted.map((c) => item(c))) : null;
    box.replaceChildren(...[head,
      visible.length ? visible.map((c) => item(c)) : h('p', { class: 'dica' }, t('com.empty')),
      refutedBox,
      user ? contributeForm(place, rerender) : h('p', { class: 'dica' }, t('com.loginToContribute'), ' ', link(t('com.login'), openAccount)),
      h('p', { class: 'dica' }, link(t('com.rules'), openRules))].flat().filter(Boolean)); // replaceChildren não aceita listas nem null

    // veio de uma notificação ou do histórico: rola até a contribuição e destaca
    if (highlight != null) {
      const el = box.querySelector(`[data-id="${highlight}"]`);
      highlight = null;
      if (el) {
        if (refutedBox?.contains(el)) refutedBox.open = true;
        el.classList.add('destaque');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => el.classList.remove('destaque'), 3500);
      }
    }
  }

  function contributeForm(place, done) {
    if (user.banned) return h('p', { class: 'dica' }, t('com.bannedNote'));
    const kind = h('select', { name: 'kind', 'aria-label': t('com.kind') }, ['info', 'correcao', 'foto'].map((k) => h('option', { value: k }, t(`kind.${k}`))));
    const era = h('select', { name: 'era', 'aria-label': t('com.eraLabel') },
      h('option', { value: getEra() }, t('com.thisEra')), h('option', { value: '' }, t('com.allEras')));
    const body = h('textarea', { name: 'body', rows: '3', minlength: '3', maxlength: '2000', required: true, placeholder: t('com.bodyPlaceholder') });
    // foto: arquivo do computador/celular (principal) ou link de uma imagem
    const img = h('input', { type: 'url', name: 'img', placeholder: 'https://…', pattern: 'https://.*', 'aria-label': t('com.imageUrl') });
    const fileId = `foto-${place.id}`;
    const file = h('input', { type: 'file', id: fileId, accept: 'image/png,image/jpeg,image/webp', class: 'sr' });
    const preview = h('div', { class: 'previa', hidden: true });
    const pickLabel = h('label', { for: fileId, class: 'botao-arquivo', tabindex: '0', role: 'button',
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); file.click(); } } }, `📷 ${t('com.photoFile')}`);
    let chosen = null;
    let previewUrl = null;
    const clearFile = () => {
      chosen = null;
      file.value = '';
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      preview.hidden = true;
      preview.replaceChildren();
    };
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      clearFile();
      chosen = f;
      previewUrl = URL.createObjectURL(f);
      preview.replaceChildren(h('img', { src: previewUrl, alt: t('com.photoPreview') }),
        h('button', { type: 'button', class: 'link', onclick: clearFile }, t('editor.remove')));
      preview.hidden = false;
      img.value = '';
    });
    const photoBox = h('div', { class: 'campo-foto', hidden: true },
      h('div', { class: 'linha' }, pickLabel, file), preview,
      h('label', { class: 'dica' }, t('com.photoOrLink'), img));
    kind.addEventListener('change', () => { photoBox.hidden = kind.value !== 'foto'; });
    const send = h('button', { type: 'submit' }, t('com.send'));

    return h('form', {
      class: 'coluna nova', onsubmit: async (ev) => {
        ev.preventDefault();
        if (kind.value === 'foto' && !chosen && !img.value) { toast(t('com.photoRequired')); return; }
        send.disabled = true;
        let uploaded = null;
        try {
          let url = kind.value === 'foto' ? img.value || null : null;
          // link colado: confere se é mesmo uma imagem (não uma página do Instagram, YouTube…)
          if (url && !chosen && !(await isImage(url))) {
            toast(t('com.notImage'));
            img.focus();
            send.disabled = false;
            return;
          }
          if (kind.value === 'foto' && chosen) {
            send.textContent = t('com.uploading');
            const blob = await fitWebp(chosen, 1600);
            uploaded = `${user.id}/${Date.now()}.webp`;
            const { error } = await sb.storage.from('fotos').upload(uploaded, blob, { contentType: 'image/webp' });
            if (error) { uploaded = null; throw Object.assign(error, { message: 'photo_upload' }); }
            url = sb.storage.from('fotos').getPublicUrl(uploaded).data.publicUrl;
          }
          await rpc('contribute', { p_place: place.id, p_era: era.value, p_kind: kind.value, p_body: body.value, p_image: url });
          clearFile();
          toast(t('com.sent'));
          done();
        } catch (e) {
          // a foto subiu mas a contribuição foi recusada (limite, login…): não deixa arquivo órfão
          if (uploaded) sb.storage.from('fotos').remove([uploaded]).catch(() => {});
          toast(errText(e));
          send.disabled = false;
          send.textContent = t('com.send');
        }
      },
    }, h('h4', {}, t('com.new')), h('div', { class: 'linha' }, kind, era), withMentions(body), photoBox,
    h('p', { class: 'dica' }, t('com.youHave', { c: fmtCred(user.credibility) }), ' ', limitsNote(), ' ', t('com.mentionHint')),
    send);
  }

  /** true se o endereço carrega como imagem em até 8 s. */
  function isImage(url) {
    return new Promise((ok) => {
      const i = new Image();
      const timer = setTimeout(() => ok(false), 8000);
      i.onload = () => { clearTimeout(timer); ok(i.naturalWidth > 0); };
      i.onerror = () => { clearTimeout(timer); ok(false); };
      i.referrerPolicy = 'no-referrer';
      i.src = url;
    });
  }

  /** Reduz a imagem para no máximo `max` px no lado maior e converte para WebP. */
  async function fitWebp(f, max) {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', q));
      if (blob && blob.size <= 1900000) return blob;
    }
    throw new Error('photo_too_big');
  }

  return { boot, init, openAccount, openRules, openProfile, openOmbudsman, openNotifications, placeSection, closeMenu, hasSession: () => !!user };
}
