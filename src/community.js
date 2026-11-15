// Comunidade: login, contribuições por lugar, votação (aprovar / refutar com
// justificativa), credibilidade, histórico público, regras e ouvidoria.
// Todas as regras são aplicadas no banco (supabase/schema.sql); aqui é só a tela.

import { h } from './util.js';
import { t, currentLang } from './i18n.js';

const DEFAULTS = {
  cred_start: 5, cred_max: 10, gain_approved: 0.1, loss_refuted: 0.1, gain_just: 0.01, loss_just: 0.01,
  vote_min_cred: 3, vote_min_days: 7, limit1_below: 2, limit1_days: 30, limit2_below: 1, limit2_days: 90,
  perse_window_days: 90, perse_min_refutes: 5, perse_share: 0.5, perse_reverted_share: 0.5,
  report_strikes: 3, report_block_days: 90, zero_recover_days: 180, zero_recover_to: 2,
};

export function createCommunity({ base, showSheet, toast, getEra, onSelectPlace, placeName }) {
  let cfg = null; // { url, anonKey, providers }
  let sb = null;
  let user = null; // { id, name, credibility, created_at, banned }
  let rules = { ...DEFAULTS };
  let ready = null;

  const fmtNum = (n) => Number(n).toLocaleString(currentLang(), { maximumFractionDigits: 2 });
  const R = () => Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, fmtNum(v)]));
  const fmtDate = (d) => new Date(d).toLocaleDateString(currentLang(), { day: 'numeric', month: 'short', year: 'numeric' });
  const errText = (e) => {
    const code = /([a-z_0-9]+)/.exec(e?.message ?? '')?.[1];
    const k = `err.${code}`;
    return t(k) !== k ? t(k, R()) : t('err.generic');
  };

  async function loadConfig() {
    try {
      const res = await fetch(`${base}data/community.json`, { cache: 'no-cache' });
      cfg = res.ok ? await res.json() : null;
    } catch { cfg = null; }
    return !!(cfg?.url && cfg?.anonKey);
  }

  /** Carrega a biblioteca e a sessão só quando a comunidade é usada. */
  function init() {
    ready ??= (async () => {
      if (!(await loadConfig())) return false;
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(cfg.url, cfg.anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
      const { data } = await sb.from('config').select('key,value');
      for (const r of data ?? []) rules[r.key] = Number(r.value);
      await refreshUser();
      sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') refreshUser(); });
      const u = new URL(location.href);
      if (u.searchParams.has('code')) { u.searchParams.delete('code'); history.replaceState(history.state, '', u); }
      return true;
    })();
    return ready;
  }

  async function refreshUser() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { user = null; return; }
    const { data } = await sb.from('public_profiles').select('*').eq('id', session.user.id).maybeSingle();
    user = data ? { ...data, credibility: Number(data.credibility) } : null;
  }

  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  // ------------------------------------------------------------ painéis
  const credBadge = (c) => h('span', { class: 'cred', title: t('com.credibility') }, `★ ${fmtNum(c)}`);
  const link = (text, onclick) => h('button', { type: 'button', class: 'link', onclick }, text);

  function notReady() {
    return [
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('com.title')),
      h('p', {}, t('com.soon')),
      h('div', { class: 'acoes' }, h('button', { type: 'button', onclick: () => openRules() }, t('com.rules'))),
    ];
  }

  async function openAccount() {
    showSheet(h('p', { class: 'carregando' }, t('com.loading')));
    if (!(await init())) { showSheet(...notReady()); return; }
    if (!user) { showSheet(...loginView()); return; }
    showSheet(
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, user.name, ' ', credBadge(user.credibility)),
      user.banned ? h('p', { class: 'ausente' }, t('com.bannedNote')) : h('p', { class: 'dica' }, limitsNote()),
      nameForm(),
      h('div', { class: 'acoes' },
        h('button', { type: 'button', onclick: () => openProfile(user.id) }, t('com.myHistory')),
        h('button', { type: 'button', onclick: () => openRules() }, t('com.rules')),
        h('button', { type: 'button', onclick: () => openOmbudsman() }, t('com.ombudsman')),
        h('button', { type: 'button', onclick: async () => { await sb.auth.signOut(); user = null; openAccount(); } }, t('com.logout'))),
    );
  }

  function limitsNote() {
    const c = user.credibility;
    if (c <= 0) return t('com.limit0', R());
    if (c < rules.limit2_below) return t('com.limit2', R());
    if (c < rules.limit1_below) return t('com.limit1', R());
    if (c < rules.vote_min_cred) return t('com.noVote', R());
    return t('com.allOk');
  }

  function nameForm() {
    const input = h('input', { type: 'text', value: user.name, minlength: '2', maxlength: '40', 'aria-label': t('com.name') });
    return h('form', {
      class: 'linha', onsubmit: async (ev) => {
        ev.preventDefault();
        try { await rpc('set_name', { p_name: input.value }); await refreshUser(); toast(t('com.saved')); } catch (e) { toast(errText(e)); }
      },
    }, h('label', {}, t('com.name'), input), h('button', { type: 'submit' }, t('com.save')));
  }

  function loginView() {
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'voce@exemplo.com' });
    const redirect = `${location.origin}${location.pathname}${location.search}`;
    const providers = (cfg.providers ?? ['github']).map((p) => h('button', {
      type: 'button',
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

  // ------------------------------------------------------------ regras
  async function openRules() {
    if (cfg === null) await loadConfig();
    if (cfg?.url) await init();
    const r = R();
    const li = (k) => h('li', {}, t(k, r));
    showSheet(
      h('p', { class: 'tipo' }, t('tools.account')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, t('rules.title')),
      h('p', {}, t('rules.intro')),
      h('h3', {}, t('rules.credTitle')), h('ul', {}, ['rules.cred1', 'rules.cred2', 'rules.cred3', 'rules.cred4', 'rules.cred5'].map(li)),
      h('h3', {}, t('rules.voteTitle')), h('ul', {}, ['rules.vote1', 'rules.vote2', 'rules.vote3', 'rules.vote4', 'rules.vote5'].map(li)),
      h('h3', {}, t('rules.limitTitle')), h('ul', {}, ['rules.limit1', 'rules.limit2', 'rules.limit3'].map(li)),
      h('h3', {}, t('rules.ombTitle')), h('p', {}, t('rules.omb0')),
      h('ol', {}, ['rules.omb1', 'rules.omb2', 'rules.omb3'].map(li)),
      h('ul', {}, ['rules.omb4', 'rules.omb5', 'rules.omb6'].map(li)),
      h('h3', {}, t('rules.devTitle')), h('ul', {}, ['rules.dev1', 'rules.dev2', 'rules.dev3', 'rules.dev4'].map(li)),
      h('h3', {}, t('rules.transpTitle')), h('ul', {}, ['rules.transp1', 'rules.transp2', 'rules.transp3'].map(li)),
    );
  }

  // ------------------------------------------------------------ perfil público
  async function openProfile(id) {
    showSheet(h('p', { class: 'carregando' }, t('com.loading')));
    if (!(await init())) { showSheet(...notReady()); return; }
    const [{ data: p }, { data: items }] = await Promise.all([
      sb.from('public_profiles').select('*').eq('id', id).maybeSingle(),
      sb.from('contribution_list').select('*').eq('author', id).order('created_at', { ascending: false }).limit(200),
    ]);
    if (!p) { showSheet(h('p', {}, t('err.not_found'))); return; }
    const effect = (c) => {
      if (p.cred_reset_at && c.created_at < p.cred_reset_at) return t('com.beforeReset');
      const just = c.kind === 'justificativa';
      if (c.outcome > 0) return `+${fmtNum(just ? rules.gain_just : rules.gain_approved)}`;
      if (c.outcome < 0) return `−${fmtNum(just ? rules.loss_just : rules.loss_refuted)}`;
      return '0';
    };
    showSheet(
      h('p', { class: 'tipo' }, t('com.profile')),
      h('h2', { id: 'painel-titulo', tabindex: '-1' }, p.name, ' ', credBadge(p.credibility)),
      p.banned ? h('p', { class: 'ausente' }, p.ban_reason ?? t('com.banned')) : null,
      h('p', { class: 'dica' }, t('com.memberSince', { date: fmtDate(p.created_at) }), ' · ', t('com.historyNote', R())),
      items?.length ? h('table', { class: 'historico' },
        h('thead', {}, h('tr', {}, h('th', {}, t('com.when')), h('th', {}, t('com.what')), h('th', {}, t('com.votes')), h('th', {}, t('com.effect')))),
        h('tbody', {}, items.map((c) => h('tr', { 'data-outcome': c.outcome },
          h('td', {}, fmtDate(c.created_at)),
          h('td', {}, h('strong', {}, t(`kind.${c.kind}`)), ' · ', link(placeName(c.place_id), () => onSelectPlace(c.place_id)), h('br'), h('span', { class: 'trecho' }, c.body.slice(0, 90))),
          h('td', {}, `✔ ${c.approvals} · ✖ ${c.refutes}`),
          h('td', { class: 'efeito' }, effect(c)))))) : h('p', {}, t('com.noHistory')),
      user && user.id !== id ? h('div', { class: 'acoes' }, h('button', { type: 'button', onclick: () => openOmbudsman(id, p.name) }, t('com.reportUser'))) : null,
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
      const q = who.value.trim();
      if (q.length < 2) { found.replaceChildren(); return; }
      const { data } = await sb.from('public_profiles').select('id,name').ilike('name', `%${q}%`).limit(6);
      found.replaceChildren(...(data ?? []).filter((u) => u.id !== user?.id).map((u) => h('li', {}, link(u.name, () => { accused = u.id; who.value = u.name; found.replaceChildren(); }))));
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
      const refuteBox = h('form', {
        class: 'coluna refutar', hidden: true, onsubmit: async (ev) => {
          ev.preventDefault();
          try { await rpc('vote', { p_id: c.id, p_value: -1, p_justification: ev.target.elements.j.value }); await refreshUser(); rerender(); } catch (e) { toast(errText(e)); }
        },
      }, h('textarea', { name: 'j', rows: '3', minlength: '10', maxlength: '2000', required: true, placeholder: t('com.justify') }),
      h('button', { type: 'submit' }, t('com.sendRefute')));
      const actions = !user || own || user.banned ? null : h('div', { class: 'votar' },
        vote ? [h('span', { class: 'dica' }, t(vote > 0 ? 'com.youApproved' : 'com.youRefuted')),
          link(t('com.unvote'), async () => { try { await rpc('unvote', { p_id: c.id }); rerender(); } catch (e) { toast(errText(e)); } })] : null,
        vote > 0 ? null : h('button', { type: 'button', onclick: async () => { try { await rpc('vote', { p_id: c.id, p_value: 1 }); rerender(); } catch (e) { toast(errText(e)); } } }, `✔ ${t('com.approve')}`),
        vote < 0 ? null : h('button', { type: 'button', onclick: () => { refuteBox.hidden = !refuteBox.hidden; } }, `✖ ${t('com.refute')}`));
      const replies = (kids.get(c.id) ?? []);
      return h('article', { class: `contrib nivel-${Math.min(depth, 3)}`, 'data-outcome': c.outcome },
        h('header', {},
          h('strong', {}, t(depth ? 'kind.refutacao' : `kind.${c.kind}`)), ' · ',
          link(c.author_name, () => openProfile(c.author)), ' ', credBadge(credOf.get(c.author) ?? rules.cred_start), ' · ',
          h('time', { datetime: c.created_at }, fmtDate(c.created_at)),
          c.era && !depth ? h('span', { class: 'chip chip-mini' }, c.era) : null),
        h('p', { class: 'texto' }, c.body),
        c.image_url && c.kind === 'foto' ? h('a', { href: c.image_url, target: '_blank', rel: 'noopener noreferrer' },
          h('img', { src: c.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', class: 'foto-contrib' })) : null,
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
    box.replaceChildren(head,
      visible.length ? visible.map((c) => item(c)) : h('p', { class: 'dica' }, t('com.empty')),
      refuted.length ? h('details', { class: 'refutadas' }, h('summary', {}, t('com.refutedList', { n: refuted.length })), refuted.map((c) => item(c))) : null,
      user ? contributeForm(place, rerender) : h('p', { class: 'dica' }, t('com.loginToContribute'), ' ', link(t('com.login'), openAccount)),
      h('p', { class: 'dica' }, link(t('com.rules'), openRules)));
  }

  function contributeForm(place, done) {
    if (user.banned) return h('p', { class: 'dica' }, t('com.bannedNote'));
    const kind = h('select', { name: 'kind' }, ['info', 'correcao', 'foto'].map((k) => h('option', { value: k }, t(`kind.${k}`))));
    const era = h('select', { name: 'era' },
      h('option', { value: getEra() }, t('com.thisEra')), h('option', { value: '' }, t('com.allEras')));
    const body = h('textarea', { name: 'body', rows: '3', minlength: '3', maxlength: '2000', required: true, placeholder: t('com.bodyPlaceholder') });
    const img = h('input', { type: 'url', name: 'img', placeholder: 'https://…', pattern: 'https://.*', hidden: true });
    kind.addEventListener('change', () => { img.hidden = kind.value !== 'foto'; img.required = kind.value === 'foto'; });
    return h('form', {
      class: 'coluna nova', onsubmit: async (ev) => {
        ev.preventDefault();
        try {
          await rpc('contribute', { p_place: place.id, p_era: era.value, p_kind: kind.value, p_body: body.value, p_image: img.value || null });
          toast(t('com.sent'));
          done();
        } catch (e) { toast(errText(e)); }
      },
    }, h('h4', {}, t('com.new')), h('div', { class: 'linha' }, kind, era), body, img,
    h('p', { class: 'dica' }, t('com.youHave', { c: fmtNum(user.credibility) }), ' ', limitsNote()),
    h('button', { type: 'submit' }, t('com.send')));
  }

  return { init, openAccount, openRules, openProfile, openOmbudsman, placeSection, hasSession: () => !!user };
}
