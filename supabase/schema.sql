-- Mundo Avatar · Comunidade (Supabase / PostgreSQL)
--
-- Todas as regras de contribuição, votação, credibilidade e ouvidoria ficam
-- AQUI, no banco. O site só chama as funções abaixo; ninguém consegue burlar
-- as regras pelo navegador. Os números ficam na tabela "config" e podem ser
-- mudados a qualquer momento (a página de Regras do site lê essa tabela).
--
-- Para instalar: Supabase > SQL Editor > colar este arquivo inteiro > Run.
-- Pode ser rodado de novo sem perder dados.

-- ============================================================ configuração
create table if not exists public.config (
  key text primary key,
  value numeric not null,
  label text not null
);

insert into public.config (key, value, label) values
  ('cred_start',            5,    'Credibilidade inicial de todo usuário'),
  ('cred_max',              10,   'Credibilidade máxima'),
  ('gain_approved',         0.1,  'Ganho quando uma contribuição é aprovada pela maioria'),
  ('loss_refuted',          0.1,  'Perda quando uma contribuição é refutada pela maioria'),
  ('gain_just',             0.01, 'Ganho quando uma justificativa é aprovada pela maioria'),
  ('loss_just',             0.01, 'Perda quando uma justificativa é refutada pela maioria'),
  ('vote_min_cred',         3,    'Credibilidade mínima para votar'),
  ('vote_min_days',         7,    'Idade mínima da conta (dias) para votar'),
  ('limit1_below',          2,    'Abaixo desta credibilidade: 1 contribuição por período 1'),
  ('limit1_days',           30,   'Período 1 (dias)'),
  ('limit2_below',          1,    'Abaixo desta credibilidade: 1 contribuição por período 2'),
  ('limit2_days',           90,   'Período 2 (dias)'),
  ('perse_window_days',     90,   'Ouvidoria: janela analisada (dias)'),
  ('perse_min_refutes',     5,    'Ouvidoria: mínimo de refutações do acusado contra o denunciante'),
  ('perse_share',           0.5,  'Ouvidoria: parcela mínima das refutações do acusado contra o denunciante'),
  ('perse_reverted_share',  0.5,  'Ouvidoria: parcela mínima dessas refutações que foram revertidas'),
  ('report_strikes',        3,    'Ouvidoria: denúncias arquivadas seguidas que bloqueiam novas denúncias'),
  ('report_block_days',     90,   'Ouvidoria: dias de bloqueio para novas denúncias'),
  ('zero_recover_days',     180,  'Dias com credibilidade zero até recomeçar'),
  ('zero_recover_to',       2,    'Credibilidade de quem recomeça depois da espera')
on conflict (key) do nothing;

create or replace function public.cfg(k text) returns numeric
language sql stable set search_path = public as $$ select value from config where key = k $$;

-- ================================================================ perfis
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  created_at timestamptz not null default now(),
  banned_at timestamptz,
  ban_reason text
);
-- Recomeço depois de credibilidade zero: a partir de cred_reset_at a conta
-- vale cred_base mais só as contribuições feitas depois dessa data.
alter table public.profiles add column if not exists zero_since timestamptz;
alter table public.profiles add column if not exists cred_reset_at timestamptz;
alter table public.profiles add column if not exists cred_base numeric;

-- Perfil público: @nome único (para menções), foto e preferências de notificação.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists notify_approve boolean not null default true;
alter table public.profiles add column if not exists notify_refute boolean not null default true;
alter table public.profiles add column if not exists notify_mention boolean not null default true;
do $$ begin
  alter table public.profiles add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500));
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_username_unique on public.profiles (username);

-- Gera um @nome livre a partir de um texto qualquer (ex.: o login do GitHub).
create or replace function public.make_username(base text) returns text
language plpgsql volatile set search_path = public as $$
declare clean text; candidate text; n int := 0;
begin
  clean := left(regexp_replace(lower(coalesce(base, '')), '[^a-z0-9_]', '', 'g'), 16);
  if char_length(clean) < 3 then clean := 'viajante'; end if;
  candidate := clean;
  while exists (select 1 from profiles where username = candidate) loop
    n := n + 1;
    candidate := clean || n;
  end loop;
  return candidate;
end $$;

-- quem entrou antes desta versão ganha um @nome automático
update public.profiles set username = make_username(name) where username is null;
update public.profiles p set avatar_url = u.raw_user_meta_data ->> 'avatar_url'
  from auth.users u
  where u.id = p.id and p.avatar_url is null and (u.raw_user_meta_data ->> 'avatar_url') ~ '^https://';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into profiles (id, name, username, avatar_url) values (
    new.id,
    coalesce(
      nullif(left(trim(meta ->> 'user_name'), 40), ''),
      nullif(left(trim(meta ->> 'name'), 40), ''),
      'Viajante ' || substr(new.id::text, 1, 6)),
    make_username(coalesce(meta ->> 'user_name', meta ->> 'name', split_part(new.id::text, '-', 1))),
    case when (meta ->> 'avatar_url') ~ '^https://' then left(meta ->> 'avatar_url', 500) end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========================================================= contribuições
create table if not exists public.contributions (
  id bigint generated always as identity primary key,
  author uuid not null references public.profiles (id),
  place_id text not null check (char_length(place_id) <= 80),
  era text check (era in ('aang', 'korra', 'havens')),
  kind text not null check (kind in ('info', 'correcao', 'foto', 'justificativa')),
  parent_id bigint references public.contributions (id),
  body text not null check (char_length(body) between 3 and 2000),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  created_at timestamptz not null default now(),
  check ((kind = 'justificativa') = (parent_id is not null))
);
create index if not exists contributions_place on public.contributions (place_id);
create index if not exists contributions_parent on public.contributions (parent_id);
create index if not exists contributions_author on public.contributions (author);

-- Mídias de uma publicação: lista de até 6 itens {"type": "...", "url": "https://..."}.
-- Tipos: image, gif, audio, video (arquivos enviados) e embed (YouTube/Vimeo).
create or replace function public.valid_media(m jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(m) = 'array' and jsonb_array_length(m) <= 6 and not exists (
    select 1 from jsonb_array_elements(m) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'type', '') not in ('image', 'gif', 'audio', 'video', 'embed')
       or coalesce(e ->> 'url', '') !~ '^https://'
       or char_length(e ->> 'url') > 500
       or (e ->> 'type' = 'embed' and e ->> 'url' !~ '^https://(www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{6,20}|player\.vimeo\.com/video/[0-9]{3,12})$'))
$$;

alter table public.contributions add column if not exists media jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.contributions add constraint contributions_media_valid check (valid_media(media));
exception when duplicate_object then null; end $$;

-- ================================================================== votos
-- value = 1 aprova, -1 refuta (refutar exige uma justificativa, que é uma
-- contribuição do tipo 'justificativa' e também pode ser votada).
create table if not exists public.votes (
  contribution_id bigint not null references public.contributions (id) on delete cascade,
  voter uuid not null references public.profiles (id),
  value smallint not null check (value in (1, -1)),
  justification_id bigint references public.contributions (id),
  created_at timestamptz not null default now(),
  annulled_at timestamptz, -- anulado quando a ouvidoria confirma perseguição
  primary key (contribution_id, voter),
  check ((value = -1) = (justification_id is not null))
);
create index if not exists votes_voter on public.votes (voter);

-- ============================================================ apuração
-- Uma refutação só conta enquanto a justificativa dela estiver de pé
-- (a maioria prevalece também nas réplicas e tréplicas).
create or replace function public.tally(cid bigint, out approvals int, out refutes int)
language plpgsql stable set search_path = public as $$
declare r record;
begin
  approvals := 0; refutes := 0;
  for r in select value, justification_id from votes where contribution_id = cid and annulled_at is null loop
    if r.value = 1 then approvals := approvals + 1;
    elsif (select t.approvals >= t.refutes from tally(r.justification_id) t) then refutes := refutes + 1;
    end if;
  end loop;
end $$;

-- 1 = aprovada pela maioria (dá ponto), 0 = empate (entra, sem ponto), -1 = refutada (sai)
create or replace function public.outcome(cid bigint) returns int
language sql stable set search_path = public as $$ select sign(t.approvals - t.refutes)::int from tally(cid) t $$;

-- Credibilidade calculada pelo resultado atual das votações (sem o recomeço).
create or replace function public.raw_credibility(uid uuid) returns numeric
language sql stable set search_path = public as $$
  select round(greatest(0, least(cfg('cred_max'), coalesce(p.cred_base, cfg('cred_start')) + coalesce((
    select sum(case when c.kind = 'justificativa'
      then case outcome(c.id) when 1 then cfg('gain_just') when -1 then -cfg('loss_just') else 0 end
      else case outcome(c.id) when 1 then cfg('gain_approved') when -1 then -cfg('loss_refuted') else 0 end
    end)
    from contributions c where c.author = uid and (p.cred_reset_at is null or c.created_at >= p.cred_reset_at)), 0))), 2)
  from profiles p where p.id = uid
$$;

-- Quem está em zero há zero_recover_days dias já aparece com zero_recover_to.
create or replace function public.credibility(uid uuid) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.zero_since is not null and p.zero_since <= now() - make_interval(days => cfg('zero_recover_days')::int)
      then cfg('zero_recover_to')
    else raw_credibility(uid) end
  from profiles p where p.id = uid
$$;

-- Atualiza a marca de "em zero desde" e aplica o recomeço quando o prazo passou.
-- Chamada sempre que um voto pode ter mudado a credibilidade de alguém.
create or replace function public.refresh_cred(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = uid;
  if not found then return; end if;
  if p.zero_since is not null and p.zero_since <= now() - make_interval(days => cfg('zero_recover_days')::int) then
    update profiles set cred_base = cfg('zero_recover_to'), cred_reset_at = now(), zero_since = null where id = uid;
  elsif raw_credibility(uid) <= 0 then
    if p.zero_since is null then update profiles set zero_since = now() where id = uid; end if;
  elsif p.zero_since is not null then
    update profiles set zero_since = null where id = uid;
  end if;
end $$;

-- Recalcula o autor do item votado e de toda a cadeia acima (uma réplica
-- mexe no resultado do item que ela contesta).
create or replace function public.refresh_chain(cid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c contributions;
begin
  select * into c from contributions where id = cid;
  while found loop
    perform refresh_cred(c.author);
    exit when c.parent_id is null;
    select * into c from contributions where id = c.parent_id;
  end loop;
end $$;

-- ============================================================== ouvidoria
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references public.profiles (id),
  accused uuid not null references public.profiles (id),
  text text not null check (char_length(text) between 10 and 2000), -- privado
  created_at timestamptz not null default now(),
  total_refutes int not null,
  on_reporter int not null,
  reverted int not null,
  status text not null check (status in ('confirmada', 'arquivada'))
);

-- ================================================================= vistas
create or replace view public.public_profiles with (security_invoker = on) as
  select id, name, created_at, banned_at is not null as banned, ban_reason, credibility(id) as credibility,
         zero_since, cred_reset_at, username, avatar_url
  from profiles;

create or replace view public.contribution_list with (security_invoker = on) as
  select c.id, c.author, p.name as author_name, c.place_id, c.era, c.kind, c.parent_id, c.body, c.image_url,
         c.created_at, t.approvals, t.refutes, sign(t.approvals - t.refutes)::int as outcome,
         p.username as author_username, p.avatar_url as author_avatar, c.media
  from contributions c join profiles p on p.id = c.author, lateral tally(c.id) t;

-- resultado público das denúncias (sem o texto e sem quem denunciou)
create or replace view public.public_reports as
  select r.id, r.accused, p.name as accused_name, r.created_at, r.total_refutes, r.on_reporter, r.reverted, r.status
  from reports r join profiles p on p.id = r.accused;

-- ======================================================== ações (RPC)
create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'login_required'; end if;
  if exists (select 1 from profiles where id = uid and banned_at is not null) then raise exception 'banned'; end if;
  return uid;
end $$;

-- versão antiga (sem mídias) sai para não haver duas funções com o mesmo nome
drop function if exists public.contribute(text, text, text, text, text);
create or replace function public.contribute(p_place text, p_era text, p_kind text, p_body text,
                                             p_image text default null, p_media jsonb default '[]'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_user(); cred numeric := credibility(uid); new_id bigint;
begin
  if p_kind not in ('info', 'correcao', 'foto') then raise exception 'bad_kind'; end if;
  if not valid_media(coalesce(p_media, '[]'::jsonb)) then raise exception 'bad_media'; end if;
  perform refresh_cred(uid); -- aplica o recomeço se o prazo em zero já passou
  cred := credibility(uid);
  if cred <= 0 then raise exception 'cred_zero'; end if;
  if cred < cfg('limit2_below') and exists (select 1 from contributions where author = uid and kind <> 'justificativa'
      and created_at > now() - make_interval(days => cfg('limit2_days')::int)) then raise exception 'limit2'; end if;
  if cred < cfg('limit1_below') and exists (select 1 from contributions where author = uid and kind <> 'justificativa'
      and created_at > now() - make_interval(days => cfg('limit1_days')::int)) then raise exception 'limit1'; end if;
  insert into contributions (author, place_id, era, kind, body, image_url, media)
    values (uid, p_place, nullif(p_era, ''), p_kind, trim(p_body), nullif(trim(coalesce(p_image, '')), ''), coalesce(p_media, '[]'::jsonb))
    returning id into new_id;
  return new_id;
end $$;

create or replace function public.vote(p_id bigint, p_value int, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := require_user(); target contributions; jid bigint;
begin
  select * into target from contributions where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if target.author = uid then raise exception 'own_item'; end if;
  if credibility(uid) < cfg('vote_min_cred') then raise exception 'vote_cred'; end if;
  if (select created_at from profiles where id = uid) > now() - make_interval(days => cfg('vote_min_days')::int) then
    raise exception 'vote_age';
  end if;
  if p_value = 1 then
    insert into votes (contribution_id, voter, value) values (p_id, uid, 1)
      on conflict (contribution_id, voter) do update set value = 1, justification_id = null, created_at = now(), annulled_at = null;
  elsif p_value = -1 then
    if p_justification is null or char_length(trim(p_justification)) < 10 then raise exception 'need_justification'; end if;
    insert into contributions (author, place_id, era, kind, parent_id, body)
      values (uid, target.place_id, target.era, 'justificativa', p_id, trim(p_justification)) returning id into jid;
    insert into votes (contribution_id, voter, value, justification_id) values (p_id, uid, -1, jid)
      on conflict (contribution_id, voter) do update set value = -1, justification_id = jid, created_at = now(), annulled_at = null;
  else
    raise exception 'bad_value';
  end if;
  perform refresh_chain(p_id);
end $$;

create or replace function public.unvote(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from votes where contribution_id = p_id and voter = require_user();
  perform refresh_chain(p_id);
end $$;

create or replace function public.set_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set name = trim(p_name) where id = require_user();
end $$;

-- Denúncia de perseguição: analisada na hora, só com dados objetivos.
create or replace function public.report(p_accused uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  since timestamptz := now() - make_interval(days => cfg('perse_window_days')::int);
  n_total int; n_on int; n_rev int; ok boolean; rid bigint;
begin
  if p_accused = uid then raise exception 'self_report'; end if;
  if not exists (select 1 from profiles where id = p_accused) then raise exception 'not_found'; end if;
  -- quem acumula denúncias arquivadas seguidas fica um tempo sem denunciar
  if (select count(*) from (select status from reports where reporter = uid order by created_at desc
        limit cfg('report_strikes')::int) s where s.status = 'arquivada') >= cfg('report_strikes')
     and (select max(created_at) from reports where reporter = uid) > now() - make_interval(days => cfg('report_block_days')::int)
  then raise exception 'report_blocked'; end if;

  select count(*) into n_total from votes v
    where v.voter = p_accused and v.value = -1 and v.annulled_at is null and v.created_at > since;
  select count(*), count(*) filter (where outcome(v.justification_id) = -1) into n_on, n_rev
    from votes v join contributions c on c.id = v.contribution_id
    where v.voter = p_accused and v.value = -1 and v.annulled_at is null and v.created_at > since and c.author = uid;

  ok := n_on >= cfg('perse_min_refutes') and n_on > cfg('perse_share') * n_total and n_rev > cfg('perse_reverted_share') * n_on;

  insert into reports (reporter, accused, text, total_refutes, on_reporter, reverted, status)
    values (uid, p_accused, trim(p_text), n_total, n_on, n_rev, case when ok then 'confirmada' else 'arquivada' end)
    returning id into rid;

  if ok then
    update profiles set banned_at = now(), ban_reason = 'Perseguição confirmada pela ouvidoria (denúncia #' || rid || ')'
      where id = p_accused;
    update votes v set annulled_at = now() from contributions c
      where c.id = v.contribution_id and v.voter = p_accused and v.value = -1 and c.author = uid and v.annulled_at is null;
    perform refresh_cred(uid);
  end if;

  return jsonb_build_object('id', rid, 'confirmed', ok, 'total_refutes', n_total, 'on_reporter', n_on, 'reverted', n_rev);
end $$;

-- ================================================ perfil e notificações
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('approve', 'refute', 'mention')),
  actor uuid not null references public.profiles (id) on delete cascade,
  contribution_id bigint not null references public.contributions (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

-- Atividade pública de cada pessoa: publicações, aprovações e refutações.
create or replace view public.activity with (security_invoker = on) as
  select c.author as user_id, case when c.kind = 'justificativa' then 'refute_text' else 'post' end as kind,
         c.id as contribution_id, c.place_id, c.body, c.created_at
  from contributions c
  union all
  select v.voter, case when v.value = 1 then 'approve' else 'refute' end,
         v.contribution_id, c.place_id, c.body, v.created_at
  from votes v join contributions c on c.id = v.contribution_id
  where v.annulled_at is null;

-- avisa o autor quando alguém aprova ou refuta o que ele escreveu
create or replace function public.notify_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare a profiles; c contributions;
begin
  if tg_op = 'UPDATE' and new.value = old.value then return new; end if;
  select * into c from contributions where id = new.contribution_id;
  select * into a from profiles where id = c.author;
  if a.id is null or a.id = new.voter then return new; end if;
  if (new.value = 1 and a.notify_approve) or (new.value = -1 and a.notify_refute) then
    insert into notifications (user_id, kind, actor, contribution_id)
      values (a.id, case when new.value = 1 then 'approve' else 'refute' end, new.voter, c.id);
  end if;
  return new;
end $$;
drop trigger if exists votes_notify on public.votes;
create trigger votes_notify after insert or update of value on public.votes
  for each row execute function public.notify_vote();

-- avisa quem foi mencionado com @nome numa publicação ou justificativa
create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, actor, contribution_id)
    select distinct p.id, 'mention', new.author, new.id
    from regexp_matches(new.body, '@([A-Za-z0-9_]{3,20})', 'g') m
    join profiles p on p.username = lower(m[1])
    where p.id <> new.author and p.notify_mention
    limit 20;
  return new;
end $$;
drop trigger if exists contributions_mentions on public.contributions;
create trigger contributions_mentions after insert on public.contributions
  for each row execute function public.notify_mentions();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from profiles where username = lower(p_username) and id is distinct from auth.uid())
$$;

create or replace function public.set_profile(p_name text, p_username text, p_avatar text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := require_user(); u text := lower(trim(p_username));
begin
  if u !~ '^[a-z0-9_]{3,20}$' then raise exception 'username_invalid'; end if;
  if exists (select 1 from profiles where username = u and id <> uid) then raise exception 'username_taken'; end if;
  if p_avatar is not null and p_avatar !~ '^https://' then raise exception 'avatar_invalid'; end if;
  update profiles set name = trim(p_name), username = u, avatar_url = coalesce(nullif(p_avatar, ''), avatar_url) where id = uid;
end $$;

create or replace function public.set_notify(p_approve boolean, p_refute boolean, p_mention boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set notify_approve = p_approve, notify_refute = p_refute, notify_mention = p_mention
    where id = require_user();
end $$;

-- marca como lidas as notificações indicadas (ou todas, se p_ids for nulo)
create or replace function public.mark_read(p_ids bigint[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

-- fotos de perfil (Supabase Storage): cada pessoa só mexe na própria pasta
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/png', 'image/jpeg'])
      on conflict (id) do nothing;
    drop policy if exists "avatar proprio insere" on storage.objects;
    create policy "avatar proprio insere" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    drop policy if exists "avatar proprio atualiza" on storage.objects;
    create policy "avatar proprio atualiza" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    drop policy if exists "avatar proprio apaga" on storage.objects;
    create policy "avatar proprio apaga" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    -- mídias das publicações: fotos (o site reduz antes), GIF e áudio até 5 MB,
    -- vídeo curto até 20 MB (limites por tipo conferidos no site; aqui, o teto geral)
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('midia', 'midia', true, 20971520, array[
        'image/webp', 'image/png', 'image/jpeg', 'image/gif',
        'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav',
        'video/mp4', 'video/webm', 'video/quicktime'])
      on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    drop policy if exists "foto propria insere" on storage.objects;
    drop policy if exists "foto propria apaga" on storage.objects;
    drop policy if exists "midia propria insere" on storage.objects;
    create policy "midia propria insere" on storage.objects for insert to authenticated
      with check (bucket_id = 'midia' and (storage.foldername(name))[1] = auth.uid()::text
                  and not exists (select 1 from public.profiles where id = auth.uid() and banned_at is not null));
    drop policy if exists "midia propria apaga" on storage.objects;
    create policy "midia propria apaga" on storage.objects for delete to authenticated
      using (bucket_id = 'midia' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- notificações chegam na hora (Supabase Realtime), sem precisar recarregar
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ================================================ permissões e segurança
alter table public.config enable row level security;
alter table public.profiles enable row level security;
alter table public.contributions enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;

drop policy if exists "leitura publica" on public.config;
create policy "leitura publica" on public.config for select using (true);
drop policy if exists "leitura publica" on public.profiles;
create policy "leitura publica" on public.profiles for select using (true);
drop policy if exists "leitura publica" on public.contributions;
create policy "leitura publica" on public.contributions for select using (true);
drop policy if exists "leitura publica" on public.votes;
create policy "leitura publica" on public.votes for select using (true);
drop policy if exists "so as proprias" on public.reports;
create policy "so as proprias" on public.reports for select using (reporter = auth.uid());

-- ninguém escreve direto nas tabelas: só pelas funções acima
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on public.config, public.profiles, public.contributions, public.votes to anon, authenticated;
grant select on public.reports to authenticated;
grant select on public.public_profiles, public.contribution_list, public.public_reports to anon, authenticated;

revoke execute on function public.contribute, public.vote, public.unvote, public.set_name, public.report, public.require_user from public, anon;
grant execute on function public.contribute, public.vote, public.unvote, public.set_name, public.report to authenticated;
grant execute on function public.cfg, public.tally, public.outcome, public.credibility, public.raw_credibility to anon, authenticated;
revoke execute on function public.refresh_cred, public.refresh_chain from public, anon, authenticated;

alter table public.notifications enable row level security;
drop policy if exists "so as proprias" on public.notifications;
create policy "so as proprias" on public.notifications for select using (user_id = auth.uid());
grant select on public.notifications to authenticated;
grant select on public.activity to anon, authenticated;
revoke execute on function public.set_profile, public.set_notify, public.mark_read from public, anon;
grant execute on function public.set_profile, public.set_notify, public.mark_read to authenticated;
grant execute on function public.username_available to anon, authenticated;
revoke execute on function public.make_username, public.notify_vote, public.notify_mentions from public, anon, authenticated;
