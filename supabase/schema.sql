-- ============================================================================
-- Musical Forge Studio — Community Board, Phase 1 (backend)
--
-- Paste this whole file into your Supabase project's SQL editor and run it.
-- It creates a global board of shared creations plus an account-free,
-- impersonation-resistant "creator name" system:
--
--   * Anyone can READ the board (no account).
--   * Anyone can POST a creation (no account) via the share_creation() function.
--   * A display name is claimed FIRST-COME. Only the device holding that name's
--     secret can post under it again — so nobody can steal your name.
--   * The server only ever stores a SHA-256 HASH of the secret, never the secret.
--   * No personal data (no email, no IP) is collected or stored.
--
-- Security model: clients can only SELECT rows and CALL share_creation().
-- All writes go through that function (SECURITY DEFINER, fixed search_path),
-- which enforces name ownership and size limits. The publishable "anon" key is
-- safe to ship in the app; it grants exactly these capabilities and nothing more.
-- ============================================================================

create extension if not exists pgcrypto;   -- for digest() / gen_random_uuid()

-- --- tables -----------------------------------------------------------------

create table if not exists public.names (
  name_key     text primary key,                 -- lower(trim(display_name))
  display_name text not null,                     -- as typed, for display
  secret_hash  text not null,                     -- hex SHA-256 of creator secret
  created_at   timestamptz not null default now()
);

create table if not exists public.creations (
  id           uuid primary key default gen_random_uuid(),
  name_key     text references public.names(name_key),   -- null only in legacy rows; new posts always carry a name
  display_name text not null default 'Anonymous',
  kind         text not null check (kind in ('theme','fx','score','song')),
  title        text not null default 'untitled',
  payload      jsonb not null,                    -- the creation's own recipe JSON
  created_at   timestamptz not null default now()
);

create index if not exists creations_created_idx on public.creations (created_at desc);

-- migration for pre-existing tables: allow the sequencer's 'song' kind
alter table public.creations drop constraint if exists creations_kind_check;
alter table public.creations add constraint creations_kind_check
  check (kind in ('theme','fx','score','song'));

-- --- row level security -----------------------------------------------------

alter table public.names     enable row level security;
alter table public.creations enable row level security;

-- Reading is open to everyone; there are no direct client writes (all writes
-- go through share_creation() below).
drop policy if exists creations_read on public.creations;
drop policy if exists names_read     on public.names;
create policy creations_read on public.creations for select using (true);
create policy names_read     on public.names     for select using (true);

-- --- the one write path -----------------------------------------------------

create or replace function public.share_creation(
  p_name    text,
  p_secret  text,
  p_kind    text,
  p_title   text,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_disp text := btrim(coalesce(p_name, ''));
  v_key  text := nullif(lower(v_disp), '');
  v_hash text;
  v_id   uuid;
begin
  -- size / sanity limits (also enforced client-side, re-checked here)
  if p_kind not in ('theme','fx','score','song') then
    raise exception 'unsupported kind';
  end if;
  if p_payload is null or length(p_payload::text) > 200000 then
    raise exception 'payload missing or too large';
  end if;
  if length(coalesce(p_title,'')) > 80 then
    raise exception 'title too long';
  end if;
  if length(v_disp) > 40 then
    raise exception 'name too long';
  end if;

  -- a display name is REQUIRED: no anonymous posts on the board
  if v_key is null then
    raise exception 'a display name is required to share to the community board';
  end if;

  -- posting under a name requires the device's creator secret
  if length(coalesce(p_secret,'')) < 16 then
    raise exception 'a creator secret is required to post under a name';
  end if;
  v_hash := encode(digest(p_secret, 'sha256'), 'hex');

  -- first post under this name claims it; later posts must match
  insert into public.names(name_key, display_name, secret_hash)
    values (v_key, v_disp, v_hash)
    on conflict (name_key) do nothing;

  if not exists (
    select 1 from public.names where name_key = v_key and secret_hash = v_hash
  ) then
    raise exception 'that name is already taken by someone else';
  end if;

  -- rate limit: a name may post at most 10 times per hour
  if (select count(*) from public.creations c
       where c.name_key = v_key and c.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate limit: this name has posted a lot in the last hour — try again later';
  end if;

  -- duplicate guard: the exact same recipe can't be re-posted within 10 minutes
  if exists (select 1 from public.creations c
              where c.payload = p_payload and c.created_at > now() - interval '10 minutes') then
    raise exception 'that exact creation was just shared — no need to post it twice';
  end if;

  insert into public.creations(name_key, display_name, kind, title, payload)
    values (v_key, v_disp, p_kind,
            coalesce(nullif(p_title,''),'untitled'), p_payload)
    returning id into v_id;

  return v_id;
end;
$$;

-- Clients may only execute the function; they cannot write tables directly.
revoke all on function public.share_creation(text,text,text,text,jsonb) from public;
grant execute on function public.share_creation(text,text,text,text,jsonb) to anon, authenticated;

-- --- owner delete -----------------------------------------------------------
-- A creation can be deleted only by the device that holds its name's secret
-- (i.e. the poster). Anonymous posts have no owner and can only be removed from
-- the dashboard. This powers the in-app "✕ Delete" on your own board cards.
create or replace function public.delete_creation(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(digest(coalesce(p_secret,''), 'sha256'), 'hex');
begin
  delete from public.creations c
   using public.names n
   where c.id = p_id
     and c.name_key = n.name_key
     and n.secret_hash = v_hash;
  if not found then
    raise exception 'not allowed to delete this creation';
  end if;
end;
$$;

revoke all on function public.delete_creation(uuid, text) from public;
grant execute on function public.delete_creation(uuid, text) to anon, authenticated;

-- --- likes & load counts -----------------------------------------------------
alter table public.creations add column if not exists likes int not null default 0;
alter table public.creations add column if not exists loads int not null default 0;

-- One like per creation per device, enforced SERVER-side: each like is a row
-- keyed by (creation, hashed device token), and the likes column is just the
-- row count. Replaying set_like(true) from curl can't inflate anything.
create table if not exists public.likes (
  creation_id uuid not null references public.creations(id) on delete cascade,
  device_hash text not null,
  created_at  timestamptz not null default now(),
  primary key (creation_id, device_hash)
);
alter table public.likes enable row level security;   -- no policies: clients
-- never touch this table directly; only the definer function below does.

drop function if exists public.set_like(uuid, boolean);   -- pre-device version
create or replace function public.set_like(p_id uuid, p_device text, p_liked boolean)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v int;
  v_hash text;
begin
  if length(coalesce(p_device,'')) < 16 then
    raise exception 'bad device token';
  end if;
  v_hash := encode(digest(p_device, 'sha256'), 'hex');
  if p_liked then
    insert into public.likes(creation_id, device_hash) values (p_id, v_hash)
      on conflict do nothing;
  else
    delete from public.likes where creation_id = p_id and device_hash = v_hash;
  end if;
  update public.creations
     set likes = (select count(*) from public.likes l where l.creation_id = p_id)
   where id = p_id
   returning likes into v;
  if v is null then raise exception 'no such creation'; end if;
  return v;
end;
$$;
revoke all on function public.set_like(uuid, text, boolean) from public;
grant execute on function public.set_like(uuid, text, boolean) to anon, authenticated;

-- Loads count every open by design ("Most liked" is the quality benchmark).
create or replace function public.register_load(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v int;
begin
  update public.creations set loads = loads + 1 where id = p_id returning loads into v;
  return coalesce(v, 0);
end;
$$;
revoke all on function public.register_load(uuid) from public;
grant execute on function public.register_load(uuid) to anon, authenticated;

-- ============================================================================
-- Moderation (you, in the Supabase dashboard):
--   delete a creation:  delete from public.creations where id = '<uuid>';
--   release a name:      delete from public.names where name_key = '<name>';
-- Posting requires a display name (no anonymous posts). Rate limits (in
-- share_creation): 10 posts/hour per name, and identical payloads rejected
-- within 10 minutes. Likes are one-per-device, enforced server-side via the
-- likes table.
-- ============================================================================
