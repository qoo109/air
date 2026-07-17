-- Bubble Island quick matchmaking + private realtime channels (v4.0.1)
-- Run once in Supabase SQL Editor.
-- Note: realtime.messages already has RLS enabled by Supabase.

create extension if not exists pgcrypto;

create table if not exists public.quick_matches (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null check (char_length(host_name) between 2 and 12),
  guest_name text not null check (char_length(guest_name) between 2 and 12),
  status text not null default 'matched' check (status in ('matched','playing','finished','cancelled')),
  host_score integer not null default 0 check (host_score between 0 and 99),
  guest_score integer not null default 0 check (guest_score between 0 and 99),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check (host_user_id <> guest_user_id)
);

create table if not exists public.quick_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 2 and 12),
  status text not null default 'waiting' check (status in ('waiting','matched','cancelled')),
  match_id uuid references public.quick_matches(id) on delete set null,
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

create index if not exists quick_match_queue_waiting_idx
  on public.quick_match_queue (status, joined_at, heartbeat_at);
create index if not exists quick_matches_host_idx on public.quick_matches (host_user_id, status);
create index if not exists quick_matches_guest_idx on public.quick_matches (guest_user_id, status);

alter table public.quick_matches enable row level security;
alter table public.quick_match_queue enable row level security;

drop policy if exists "players can read own quick matches" on public.quick_matches;
create policy "players can read own quick matches"
on public.quick_matches for select to authenticated
using (auth.uid() = host_user_id or auth.uid() = guest_user_id);

drop policy if exists "players can read own queue row" on public.quick_match_queue;
create policy "players can read own queue row"
on public.quick_match_queue for select to authenticated
using (auth.uid() = user_id);

grant select on public.quick_matches to authenticated;
grant select on public.quick_match_queue to authenticated;

create or replace function public.join_quick_match(p_player_name text)
returns table(match_id uuid, player_role text, opponent_name text, match_status text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(regexp_replace(coalesce(p_player_name,''), '\s+', ' ', 'g'));
  v_existing public.quick_matches%rowtype;
  v_opponent public.quick_match_queue%rowtype;
  v_match_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 12 then
    raise exception 'INVALID_PLAYER_NAME';
  end if;

  perform pg_advisory_xact_lock(2026071701);

  update public.quick_match_queue
     set status='cancelled', match_id=null
   where status='waiting'
     and heartbeat_at < now() - interval '20 seconds';

  select * into v_existing
    from public.quick_matches
   where status in ('matched','playing')
     and (host_user_id=v_uid or guest_user_id=v_uid)
   order by created_at desc
   limit 1;

  if found then
    update public.quick_match_queue
       set player_name=v_name, status='matched', match_id=v_existing.id, heartbeat_at=now()
     where user_id=v_uid;
    return query select
      v_existing.id,
      case when v_existing.host_user_id=v_uid then 'host' else 'guest' end,
      case when v_existing.host_user_id=v_uid then v_existing.guest_name else v_existing.host_name end,
      v_existing.status;
    return;
  end if;

  insert into public.quick_match_queue(user_id,player_name,status,match_id,joined_at,heartbeat_at)
  values(v_uid,v_name,'waiting',null,now(),now())
  on conflict(user_id) do update set
    player_name=excluded.player_name,
    status='waiting',
    match_id=null,
    joined_at=case when public.quick_match_queue.status='waiting' then public.quick_match_queue.joined_at else now() end,
    heartbeat_at=now();

  select q.* into v_opponent
    from public.quick_match_queue q
   where q.status='waiting'
     and q.user_id<>v_uid
     and q.heartbeat_at >= now() - interval '20 seconds'
   order by q.joined_at asc
   for update skip locked
   limit 1;

  if not found then
    return query select null::uuid, 'waiting'::text, null::text, 'waiting'::text;
    return;
  end if;

  insert into public.quick_matches(host_user_id,guest_user_id,host_name,guest_name,status)
  values(v_opponent.user_id,v_uid,v_opponent.player_name,v_name,'matched')
  returning id into v_match_id;

  update public.quick_match_queue
     set status='matched', match_id=v_match_id, heartbeat_at=now()
   where user_id in (v_opponent.user_id,v_uid);

  return query select v_match_id, 'guest'::text, v_opponent.player_name, 'matched'::text;
end;
$$;

create or replace function public.cancel_quick_match()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_match uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select match_id into v_match from public.quick_match_queue where user_id=v_uid;
  update public.quick_match_queue set status='cancelled', match_id=null, heartbeat_at=now() where user_id=v_uid;
  if v_match is not null then
    update public.quick_matches
       set status='cancelled', ended_at=coalesce(ended_at,now())
     where id=v_match and status in ('matched','playing')
       and (host_user_id=v_uid or guest_user_id=v_uid);
    update public.quick_match_queue set status='cancelled', match_id=null
     where match_id=v_match;
  end if;
end;
$$;

create or replace function public.start_quick_match(p_match_id uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.quick_matches
     set status='playing', started_at=coalesce(started_at,now())
   where id=p_match_id
     and status='matched'
     and (host_user_id=auth.uid() or guest_user_id=auth.uid());
$$;

create or replace function public.finish_quick_match(p_match_id uuid,p_host_score integer,p_guest_score integer)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.quick_matches
     set status='finished',
         host_score=greatest(0,least(99,p_host_score)),
         guest_score=greatest(0,least(99,p_guest_score)),
         ended_at=now()
   where id=p_match_id
     and status in ('matched','playing')
     and (host_user_id=auth.uid() or guest_user_id=auth.uid());
  update public.quick_match_queue
     set status='cancelled', match_id=null, heartbeat_at=now()
   where match_id=p_match_id;
$$;

revoke all on function public.join_quick_match(text) from public;
revoke all on function public.cancel_quick_match() from public;
revoke all on function public.start_quick_match(uuid) from public;
revoke all on function public.finish_quick_match(uuid,integer,integer) from public;
grant execute on function public.join_quick_match(text) to authenticated;
grant execute on function public.cancel_quick_match() to authenticated;
grant execute on function public.start_quick_match(uuid) to authenticated;
grant execute on function public.finish_quick_match(uuid,integer,integer) to authenticated;

-- Supabase already owns and protects realtime.messages.
-- Only create the channel authorization policies below.
drop policy if exists "match players receive game broadcasts" on realtime.messages;
create policy "match players receive game broadcasts"
on realtime.messages for select to authenticated
using (
  exists (
    select 1 from public.quick_matches m
    where (select realtime.topic()) = 'game:' || m.id::text || ':play'
      and (m.host_user_id=(select auth.uid()) or m.guest_user_id=(select auth.uid()))
      and m.status in ('matched','playing')
  )
);

drop policy if exists "match players send game broadcasts" on realtime.messages;
create policy "match players send game broadcasts"
on realtime.messages for insert to authenticated
with check (
  exists (
    select 1 from public.quick_matches m
    where (select realtime.topic()) = 'game:' || m.id::text || ':play'
      and (m.host_user_id=(select auth.uid()) or m.guest_user_id=(select auth.uid()))
      and m.status in ('matched','playing')
  )
);

create or replace function public.quick_match_waiting_count()
returns integer
language sql
security definer
set search_path = public, auth
stable
as $$
  select count(*)::integer
  from public.quick_match_queue
  where status='waiting' and heartbeat_at >= now() - interval '20 seconds';
$$;
revoke all on function public.quick_match_waiting_count() from public;
grant execute on function public.quick_match_waiting_count() to authenticated;
