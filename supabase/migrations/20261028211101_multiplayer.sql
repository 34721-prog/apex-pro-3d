-- Apex Dynasty 3D Pro: guest profiles, transactional rooms and race results.
-- Browser clients may use only the Supabase anon/publishable key. All mutations
-- below run as narrowly scoped SECURITY DEFINER RPCs and validate auth.uid().

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  host_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 3 and 40),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'waiting'
    check (status in ('waiting', 'countdown', 'racing', 'results', 'closed')),
  track_id text not null check (track_id in (
    'aurora', 'veloce', 'serpente', 'neon', 'titan', 'vento', 'sahara',
    'alpine', 'emerald', 'oldtown', 'sunset', 'nordic', 'desert-night',
    'imperiale', 'sakura', 'lumina', 'discovery'
  )),
  lap_count integer not null check (lap_count between 8 and 30),
  max_players integer not null check (max_players between 2 and 6),
  bot_count integer not null default 0 check (bot_count between 0 and 5),
  race_id uuid,
  countdown_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'driver' check (role in ('host', 'driver')),
  ready boolean not null default false,
  connection_status text not null default 'reconnecting'
    check (connection_status in ('online', 'reconnecting', 'offline')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  race_id uuid,
  primary key (room_id, player_id)
);

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  race_id uuid not null,
  player_id uuid references public.profiles(id) on delete set null,
  entity_key text not null check (char_length(entity_key) between 6 and 48),
  driver_name text not null check (char_length(driver_name) between 2 and 32),
  position integer not null check (position between 1 and 6),
  completed_laps integer not null check (completed_laps between 0 and 30),
  finish_time numeric(12, 3) check (finish_time is null or finish_time between 0 and 86400),
  best_lap numeric(12, 3) check (best_lap is null or best_lap between 1 and 3600),
  penalty_seconds numeric(8, 3) not null default 0 check (penalty_seconds between 0 and 3600),
  result_status text not null check (result_status in ('finished', 'dnf', 'disconnected')),
  created_at timestamptz not null default now(),
  unique (room_id, race_id, entity_key),
  unique (room_id, race_id, position)
);

create index if not exists rooms_public_lobby_idx
  on public.rooms (visibility, status, updated_at desc);
create index if not exists rooms_host_status_idx
  on public.rooms (host_id, status);
create index if not exists room_players_active_idx
  on public.room_players (room_id, left_at, joined_at);
create index if not exists room_players_heartbeat_idx
  on public.room_players (last_seen_at);
create index if not exists room_players_race_idx
  on public.room_players (room_id, race_id, player_id);
create index if not exists race_results_room_race_idx
  on public.race_results (room_id, race_id, position);
create index if not exists race_results_player_idx
  on public.race_results (player_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.race_results enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  );
$$;

create or replace function public.can_view_room(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id
      and (
        (r.visibility = 'public' and r.status in ('waiting', 'countdown', 'racing', 'results'))
        or public.is_room_member(r.id)
      )
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_profile_id = auth.uid() or exists (
    select 1
    from public.room_players rp
    where rp.player_id = p_profile_id
      and rp.left_at is null
      and public.is_room_member(rp.room_id)
  );
$$;

create or replace function public.can_access_room_topic(p_topic text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
begin
  if p_topic !~ '^room:[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  v_room_id := substring(p_topic from 6)::uuid;
  return public.is_room_member(v_room_id);
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.can_send_room_event(
  p_topic text,
  p_event text,
  p_payload jsonb
)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_race_id uuid;
  v_actor uuid := auth.uid();
  v_event text := coalesce(p_payload ->> 'event', p_event, '');
  v_body jsonb := coalesce(p_payload -> 'payload', p_payload);
begin
  if v_actor is null or not public.can_access_room_topic(p_topic) then return false; end if;
  if p_topic !~ '^room:[0-9a-fA-F-]{36}$' then return false; end if;
  v_room_id := substring(p_topic from 6)::uuid;

  if v_event in ('race-input', 'race-command', 'race-snapshot') then
    if coalesce(v_body ->> 'raceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    v_race_id := (v_body ->> 'raceId')::uuid;
  end if;

  if v_event = 'race-snapshot' then
    return exists (
      select 1 from public.rooms r
      join public.room_players rp on rp.room_id = r.id
      where r.id = v_room_id and r.host_id = v_actor
        and rp.player_id = v_actor and rp.left_at is null
        and r.status = 'racing' and r.race_id = v_race_id
    );
  elsif v_event in ('race-input', 'race-command') then
    if v_body ->> 'playerId' is distinct from v_actor::text then return false; end if;
    return exists (
      select 1 from public.rooms r
      join public.room_players rp on rp.room_id = r.id
      where r.id = v_room_id and rp.player_id = v_actor
        and rp.left_at is null and rp.race_id = r.race_id
        and r.status = 'racing' and r.race_id = v_race_id
    );
  end if;

  -- Presence and non-game status broadcasts are permitted to room members;
  -- race inputs are identity-bound and only the host may publish snapshots.
  return true;
exception when invalid_text_representation then
  return false;
end;
$$;

drop policy if exists profiles_read_self_or_room on public.profiles;
create policy profiles_read_self_or_room
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy rooms_read_public_or_member
  on public.rooms for select to authenticated
  using (
    (visibility = 'public' and status in ('waiting', 'countdown', 'racing', 'results'))
    or public.is_room_member(id)
  );
create policy room_players_read_visible_room
  on public.room_players for select to authenticated
  using (public.can_view_room(room_id));
create policy race_results_read_room_members
  on public.race_results for select to authenticated
  using (public.is_room_member(room_id));

-- Browser changes are delivered only through RPCs; direct INSERT/UPDATE/DELETE
-- policies intentionally do not exist.
grant select on public.profiles, public.rooms, public.room_players, public.race_results to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.profiles, public.rooms, public.room_players, public.race_results
  from anon, authenticated;

-- Realtime Broadcast and Presence use private room topics. RLS prevents a user
-- who is not an active room participant from joining or sending to that topic.
drop policy if exists apex_room_realtime_read on realtime.messages;
create policy apex_room_realtime_read
  on realtime.messages for select to authenticated
  using (public.can_access_room_topic((select realtime.topic())));
drop policy if exists apex_room_realtime_send on realtime.messages;
create policy apex_room_realtime_send
  on realtime.messages for insert to authenticated
  with check (
    public.can_send_room_event(
      (select realtime.topic()),
      event,
      payload
    )
  );

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_name := regexp_replace(v_name, '[[:cntrl:]]', '', 'g');
  if char_length(v_name) < 2 then
    v_name := 'Piloto ' || upper(substring(replace(new.id::text, '-', '') from 1 for 5));
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 24))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_create_profile on auth.users;
create trigger on_auth_user_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create or replace function public.set_display_name(p_display_name text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := auth.uid();
  v_name text;
  v_profile public.profiles;
begin
  if v_id is null then raise exception 'authentication_required'; end if;
  v_name := btrim(regexp_replace(coalesce(p_display_name, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'display_name_length_invalid';
  end if;
  update public.profiles
    set display_name = v_name, updated_at = clock_timestamp()
    where id = v_id
    returning * into v_profile;
  if not found then raise exception 'profile_not_found'; end if;
  return jsonb_build_object(
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
end;
$$;

create or replace function public.sweep_stale_rooms()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_room record;
  v_next_host uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  update public.room_players rp
    set connection_status = 'offline'
    from public.rooms r
    where rp.room_id = r.id
      and rp.left_at is null
      and rp.connection_status <> 'offline'
      and rp.last_seen_at < clock_timestamp() - interval '45 seconds';

  -- In the lobby, abandoned seats expire after two minutes; the row remains so
  -- the same auth identity can reclaim it on reconnect without making a clone.
  update public.room_players rp
    set left_at = clock_timestamp(), ready = false
    from public.rooms r
    where rp.room_id = r.id
      and r.status = 'waiting'
      and rp.left_at is null
      and rp.last_seen_at < clock_timestamp() - interval '2 minutes';

  for v_room in
    select r.id, r.host_id, r.status, r.created_at
    from public.rooms r
    where r.status in ('waiting', 'countdown', 'racing')
      and exists (
        select 1 from public.room_players h
        where h.room_id = r.id and h.player_id = r.host_id
          and (h.left_at is not null or h.last_seen_at < clock_timestamp() - interval '45 seconds')
      )
  loop
    if v_room.status = 'waiting' then
      select rp.player_id into v_next_host
      from public.room_players rp
      where rp.room_id = v_room.id
        and rp.left_at is null
        and rp.player_id <> v_room.host_id
        and rp.last_seen_at >= clock_timestamp() - interval '45 seconds'
      order by rp.joined_at, rp.player_id
      limit 1;
      if v_next_host is not null then
        update public.rooms set host_id = v_next_host, updated_at = clock_timestamp()
          where id = v_room.id;
        update public.room_players set role = case when player_id = v_next_host then 'host' else 'driver' end
          where room_id = v_room.id and left_at is null;
      elsif v_room.created_at < clock_timestamp() - interval '30 minutes' then
        update public.rooms set status = 'closed', closed_reason = 'empty_timeout', updated_at = clock_timestamp()
          where id = v_room.id;
      end if;
    elsif v_room.status in ('countdown', 'racing') then
      update public.rooms set status = 'closed', closed_reason = 'host_timeout', updated_at = clock_timestamp()
        where id = v_room.id and status = v_room.status;
    end if;
  end loop;
end;
$$;

create or replace function public.create_room(
  p_name text,
  p_visibility text,
  p_track_id text,
  p_lap_count integer,
  p_max_players integer,
  p_bot_count integer default 0
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
  v_name text;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_not_found';
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 3 or char_length(v_name) > 40 then raise exception 'room_name_invalid'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'room_visibility_invalid'; end if;
  if p_track_id not in (
    'aurora', 'veloce', 'serpente', 'neon', 'titan', 'vento', 'sahara',
    'alpine', 'emerald', 'oldtown', 'sunset', 'nordic', 'desert-night',
    'imperiale', 'sakura', 'lumina', 'discovery'
  ) then raise exception 'track_invalid'; end if;
  if p_lap_count not between 8 and 30 then raise exception 'lap_count_invalid'; end if;
  if p_max_players not between 2 and 6 then raise exception 'max_players_invalid'; end if;
  if p_bot_count not between 0 and 5 then raise exception 'bot_count_invalid'; end if;
  v_id := gen_random_uuid();
  v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  insert into public.rooms (id, code, host_id, name, visibility, track_id, lap_count, max_players, bot_count)
  values (v_id, v_code, v_user, v_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
  insert into public.room_players (room_id, player_id, role, ready, connection_status)
  values (v_id, v_user, 'host', false, 'reconnecting');
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

create or replace function public.join_room(p_room_id uuid default null, p_code text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_player public.room_players;
  v_count integer;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from public.profiles where id = v_user) then raise exception 'profile_not_found'; end if;
  if p_room_id is null and v_code = '' then raise exception 'room_identifier_required'; end if;
  if p_room_id is not null and v_code <> '' then raise exception 'provide_room_id_or_code'; end if;

  perform public.sweep_stale_rooms();
  select * into v_room
  from public.rooms r
  where (p_room_id is not null and r.id = p_room_id)
     or (p_room_id is null and r.code = v_code)
  for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;

  select * into v_player from public.room_players
    where room_id = v_room.id and player_id = v_user;
  if found and v_player.left_at is null then
    update public.room_players
      set connection_status = 'reconnecting', last_seen_at = clock_timestamp(),
          ready = case when v_room.status = 'waiting' then false else ready end
      where room_id = v_room.id and player_id = v_user;
    return jsonb_build_object('id', v_room.id, 'code', v_room.code, 'reconnected', true);
  end if;

  if v_room.status <> 'waiting' then raise exception 'room_not_accepting_players'; end if;
  if v_room.visibility = 'private' and v_code <> v_room.code then
    raise exception 'invalid_invite_code';
  end if;
  select count(*) into v_count from public.room_players
    where room_id = v_room.id and left_at is null;
  if v_count >= v_room.max_players then raise exception 'room_full'; end if;

  insert into public.room_players (room_id, player_id, role, ready, connection_status)
  values (v_room.id, v_user, 'driver', false, 'reconnecting')
  on conflict (room_id, player_id) do update
    set role = 'driver', ready = false, connection_status = 'reconnecting',
        joined_at = clock_timestamp(), last_seen_at = clock_timestamp(), left_at = null;
  update public.rooms set updated_at = clock_timestamp() where id = v_room.id;
  return jsonb_build_object('id', v_room.id, 'code', v_room.code, 'reconnected', false);
end;
$$;

create or replace function public.set_room_connection(p_room_id uuid, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_status not in ('online', 'reconnecting', 'offline') then raise exception 'connection_status_invalid'; end if;
  update public.room_players
    set connection_status = p_status,
        last_seen_at = case when p_status = 'offline' then last_seen_at else clock_timestamp() end
    where room_id = p_room_id and player_id = v_user and left_at is null
    returning connection_status into v_status;
  if not found then raise exception 'room_membership_required'; end if;
  return jsonb_build_object('connection_status', v_status, 'server_time', clock_timestamp());
end;
$$;

create or replace function public.room_heartbeat(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  update public.room_players
    set connection_status = 'online', last_seen_at = v_now
    where room_id = p_room_id and player_id = v_user and left_at is null;
  if not found then raise exception 'room_membership_required'; end if;
  return jsonb_build_object('server_time', v_now);
end;
$$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select status into v_status from public.rooms where id = p_room_id for update;
  if not found or v_status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  update public.room_players
    set ready = coalesce(p_ready, false), connection_status = 'online', last_seen_at = clock_timestamp()
    where room_id = p_room_id and player_id = v_user and left_at is null;
  if not found then raise exception 'room_membership_required'; end if;
  update public.rooms set updated_at = clock_timestamp() where id = p_room_id;
  return jsonb_build_object('ready', p_ready);
end;
$$;

create or replace function public.configure_room(
  p_room_id uuid,
  p_name text,
  p_visibility text,
  p_track_id text,
  p_lap_count integer,
  p_max_players integer,
  p_bot_count integer
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_name text;
  v_players integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_room.host_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 3 or char_length(v_name) > 40 then raise exception 'room_name_invalid'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'room_visibility_invalid'; end if;
  if p_track_id not in (
    'aurora', 'veloce', 'serpente', 'neon', 'titan', 'vento', 'sahara',
    'alpine', 'emerald', 'oldtown', 'sunset', 'nordic', 'desert-night',
    'imperiale', 'sakura', 'lumina', 'discovery'
  ) then raise exception 'track_invalid'; end if;
  if p_lap_count not between 8 and 30 then raise exception 'lap_count_invalid'; end if;
  if p_max_players not between 2 and 6 then raise exception 'max_players_invalid'; end if;
  if p_bot_count not between 0 and 5 then raise exception 'bot_count_invalid'; end if;
  select count(*) into v_players from public.room_players
    where room_id = p_room_id and left_at is null;
  if v_players > p_max_players then raise exception 'max_players_below_current_count'; end if;

  update public.rooms set name = v_name, visibility = p_visibility, track_id = p_track_id,
    lap_count = p_lap_count, max_players = p_max_players, bot_count = p_bot_count,
    updated_at = clock_timestamp()
  where id = p_room_id;
  update public.room_players set ready = false where room_id = p_room_id and left_at is null;
  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.start_room(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_players integer;
  v_online integer;
  v_race_id uuid;
  v_start timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_room.host_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  select count(*), count(*) filter (
    where ready and connection_status = 'online' and last_seen_at >= v_now - interval '45 seconds'
  ) into v_players, v_online
  from public.room_players where room_id = p_room_id and left_at is null;
  if v_players < 1 or v_online <> v_players then raise exception 'participants_reconnecting'; end if;
  if exists (select 1 from public.room_players where room_id = p_room_id and left_at is null and not ready) then
    raise exception 'all_participants_must_be_ready';
  end if;
  if v_players > v_room.max_players or v_players > 6 then raise exception 'room_capacity_invalid'; end if;

  v_race_id := gen_random_uuid();
  v_start := v_now + interval '5 seconds';
  update public.rooms set status = 'countdown', race_id = v_race_id,
    countdown_at = v_start, started_at = null, finished_at = null,
    closed_reason = null, updated_at = v_now where id = p_room_id;
  update public.room_players set race_id = v_race_id, ready = false where room_id = p_room_id and left_at is null;
  return jsonb_build_object('race_id', v_race_id, 'countdown_at', v_start, 'server_time', v_now);
end;
$$;

create or replace function public.begin_room_race(p_room_id uuid, p_race_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.is_room_member(p_room_id) then raise exception 'room_membership_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.race_id <> p_race_id then raise exception 'race_session_mismatch'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if v_room.status = 'racing' then
    return jsonb_build_object('started', true, 'started_at', v_room.started_at, 'server_time', v_now);
  end if;
  if v_room.status <> 'countdown' then raise exception 'room_not_counting_down'; end if;
  if v_room.countdown_at > v_now then raise exception 'countdown_not_finished'; end if;
  update public.rooms set status = 'racing', started_at = v_now, updated_at = v_now where id = p_room_id;
  return jsonb_build_object('started', true, 'started_at', v_now, 'server_time', v_now);
end;
$$;

create or replace function public.finish_room_race(p_room_id uuid, p_race_id uuid, p_results jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_item jsonb;
  v_entity text;
  v_player_id uuid;
  v_driver_name text;
  v_position integer;
  v_completed integer;
  v_finish numeric;
  v_best numeric;
  v_penalty numeric;
  v_status text;
  v_count integer := 0;
  v_required_players integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_room.host_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'racing' or v_room.race_id <> p_race_id then raise exception 'race_session_mismatch'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) < 1 or jsonb_array_length(p_results) > 6 then
    raise exception 'race_result_count_invalid';
  end if;
  if exists (select 1 from public.race_results where room_id = p_room_id and race_id = p_race_id) then
    raise exception 'race_results_already_saved';
  end if;

  for v_item in select value from jsonb_array_elements(p_results) loop
    v_entity := coalesce(v_item ->> 'entity_key', '');
    if v_entity ~ '^player:[0-9a-fA-F-]{36}$' then
      v_player_id := substring(v_entity from 8)::uuid;
      if v_item ->> 'player_id' is distinct from v_player_id::text then raise exception 'result_player_mismatch'; end if;
      if not exists (
        select 1 from public.room_players rp
        where rp.room_id = p_room_id and rp.player_id = v_player_id and rp.race_id = p_race_id
      ) then raise exception 'result_player_not_in_race'; end if;
      select display_name into v_driver_name from public.profiles where id = v_player_id;
    elsif v_entity ~ '^bot:[0-4]$' then
      if v_item ->> 'player_id' is not null then raise exception 'bot_player_id_invalid'; end if;
      v_player_id := null;
      v_driver_name := btrim(coalesce(v_item ->> 'driver_name', ''));
      if char_length(v_driver_name) < 2 or char_length(v_driver_name) > 32 then raise exception 'result_name_invalid'; end if;
    else
      raise exception 'result_entity_invalid';
    end if;
    if jsonb_typeof(v_item -> 'position') <> 'number' then raise exception 'result_position_invalid'; end if;
    if jsonb_typeof(v_item -> 'completed_laps') <> 'number' then raise exception 'result_laps_invalid'; end if;
    v_position := (v_item ->> 'position')::integer;
    v_completed := (v_item ->> 'completed_laps')::integer;
    if v_position not between 1 and 6 or v_completed not between 0 and v_room.lap_count then raise exception 'race_result_value_invalid'; end if;
    if v_item ? 'finish_time' and jsonb_typeof(v_item -> 'finish_time') not in ('number', 'null') then raise exception 'result_time_invalid'; end if;
    if v_item ? 'best_lap' and jsonb_typeof(v_item -> 'best_lap') not in ('number', 'null') then raise exception 'result_best_lap_invalid'; end if;
    v_finish := case when jsonb_typeof(v_item -> 'finish_time') = 'number' then (v_item ->> 'finish_time')::numeric else null end;
    v_best := case when jsonb_typeof(v_item -> 'best_lap') = 'number' then (v_item ->> 'best_lap')::numeric else null end;
    v_penalty := case when jsonb_typeof(v_item -> 'penalty_seconds') = 'number' then (v_item ->> 'penalty_seconds')::numeric else 0 end;
    if v_finish is not null and v_finish not between 0 and 86400 then raise exception 'result_time_out_of_range'; end if;
    if v_best is not null and v_best not between 1 and 3600 then raise exception 'result_best_lap_out_of_range'; end if;
    if v_penalty not between 0 and 3600 then raise exception 'result_penalty_out_of_range'; end if;
    v_status := coalesce(v_item ->> 'result_status', '');
    if v_status not in ('finished', 'dnf', 'disconnected') then raise exception 'result_status_invalid'; end if;

    insert into public.race_results (
      room_id, race_id, player_id, entity_key, driver_name, position,
      completed_laps, finish_time, best_lap, penalty_seconds, result_status
    ) values (
      p_room_id, p_race_id, v_player_id, v_entity, v_driver_name, v_position,
      v_completed, v_finish, v_best, v_penalty, v_status
    );
    v_count := v_count + 1;
  end loop;

  select count(*) into v_required_players from public.room_players
    where room_id = p_room_id and race_id = p_race_id;
  if exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.race_id = p_race_id
      and not exists (
        select 1 from public.race_results rr
        where rr.room_id = p_room_id and rr.race_id = p_race_id and rr.player_id = rp.player_id
      )
  ) then raise exception 'human_result_missing'; end if;
  if v_count < v_required_players then raise exception 'race_result_count_invalid'; end if;

  update public.rooms set status = 'results', finished_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_room_id and race_id = p_race_id;
  return jsonb_build_object('saved', true, 'count', v_count, 'race_id', p_race_id);
end;
$$;

create or replace function public.return_room_to_lobby(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room_unavailable'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if v_room.status <> 'results' then raise exception 'room_not_in_results'; end if;
  update public.rooms set status = 'waiting', countdown_at = null, started_at = null,
    closed_reason = null, updated_at = clock_timestamp() where id = p_room_id;
  update public.room_players set ready = false, connection_status = 'online', last_seen_at = clock_timestamp()
    where room_id = p_room_id and left_at is null;
  return jsonb_build_object('returned', true);
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_next_host uuid;
  v_active integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('left', true); end if;
  update public.room_players set left_at = clock_timestamp(), ready = false,
    connection_status = 'offline' where room_id = p_room_id and player_id = v_user and left_at is null;
  if not found then return jsonb_build_object('left', true); end if;

  if v_room.host_id = v_user then
    if v_room.status in ('countdown', 'racing') then
      update public.rooms set status = 'closed', closed_reason = 'host_left', updated_at = clock_timestamp()
        where id = p_room_id;
    else
      select rp.player_id into v_next_host
      from public.room_players rp
      where rp.room_id = p_room_id and rp.left_at is null
        and rp.last_seen_at >= clock_timestamp() - interval '45 seconds'
      order by rp.joined_at, rp.player_id limit 1;
      if v_next_host is not null then
        update public.rooms set host_id = v_next_host, updated_at = clock_timestamp()
          where id = p_room_id;
        update public.room_players set role = case when player_id = v_next_host then 'host' else 'driver' end
          where room_id = p_room_id and left_at is null;
      else
        update public.rooms set status = 'closed', closed_reason = 'empty', updated_at = clock_timestamp()
          where id = p_room_id;
      end if;
    end if;
  end if;

  select count(*) into v_active from public.room_players where room_id = p_room_id and left_at is null;
  if v_active = 0 and v_room.status not in ('countdown', 'racing') then
    update public.rooms set status = 'closed', closed_reason = 'empty', updated_at = clock_timestamp()
      where id = p_room_id;
  end if;
  return jsonb_build_object('left', true, 'host_transferred', v_next_host is not null);
end;
$$;

create or replace function public.list_public_rooms()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_rooms jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform public.sweep_stale_rooms();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'name', r.name,
    'visibility', r.visibility,
    'status', r.status,
    'host_id', r.host_id,
    'track_id', r.track_id,
    'lap_count', r.lap_count,
    'max_players', r.max_players,
    'bot_count', r.bot_count,
    'player_count', (select count(*) from public.room_players rp where rp.room_id = r.id and rp.left_at is null),
    'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_rooms
  from public.rooms r
  where r.visibility = 'public' and r.status = 'waiting';
  return v_rooms;
end;
$$;

create or replace function public.get_room_state(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_players jsonb;
  v_results jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  perform public.sweep_stale_rooms();
  select * into v_room from public.rooms where id = p_room_id;
  if not found then raise exception 'room_unavailable'; end if;
  if not public.can_view_room(p_room_id) then raise exception 'room_membership_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', rp.player_id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'role', case when rp.player_id = v_room.host_id then 'host' else 'driver' end,
    'ready', rp.ready,
    'connection_status', case
      when rp.left_at is not null or rp.last_seen_at < v_now - interval '45 seconds' then 'offline'
      else rp.connection_status
    end,
    'joined_at', rp.joined_at,
    'last_seen_at', rp.last_seen_at,
    'left_at', rp.left_at
  ) order by rp.joined_at, rp.player_id), '[]'::jsonb)
  into v_players
  from public.room_players rp
  join public.profiles p on p.id = rp.player_id
  where rp.room_id = p_room_id and rp.left_at is null;

  if v_room.status = 'results' and v_room.race_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'entity_key', rr.entity_key,
      'player_id', rr.player_id,
      'driver_name', rr.driver_name,
      'position', rr.position,
      'completed_laps', rr.completed_laps,
      'finish_time', rr.finish_time,
      'best_lap', rr.best_lap,
      'penalty_seconds', rr.penalty_seconds,
      'result_status', rr.result_status
    ) order by rr.position), '[]'::jsonb)
    into v_results
    from public.race_results rr where rr.room_id = p_room_id and rr.race_id = v_room.race_id;
  else
    v_results := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'host_id', v_room.host_id,
      'name', v_room.name,
      'visibility', v_room.visibility,
      'status', v_room.status,
      'track_id', v_room.track_id,
      'lap_count', v_room.lap_count,
      'max_players', v_room.max_players,
      'bot_count', v_room.bot_count,
      'race_id', v_room.race_id,
      'countdown_at', v_room.countdown_at,
      'started_at', v_room.started_at,
      'finished_at', v_room.finished_at,
      'closed_reason', v_room.closed_reason
    ),
    'players', v_players,
    'results', v_results,
    'server_time', v_now
  );
end;
$$;

-- All exposed RPCs are callable only after a real Supabase Auth guest/OAuth
-- session. Anonymous browser role cannot mutate or read these data sets.
revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.can_view_room(uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.can_access_room_topic(text) from public, anon;
revoke all on function public.can_send_room_event(text, text, jsonb) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.can_view_room(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.can_access_room_topic(text) to authenticated;
grant execute on function public.can_send_room_event(text, text, jsonb) to authenticated;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.set_display_name(text) from public, anon;
revoke all on function public.sweep_stale_rooms() from public, anon;
revoke all on function public.create_room(text, text, text, integer, integer, integer) from public, anon;
revoke all on function public.join_room(uuid, text) from public, anon;
revoke all on function public.set_room_connection(uuid, text) from public, anon;
revoke all on function public.room_heartbeat(uuid) from public, anon;
revoke all on function public.set_room_ready(uuid, boolean) from public, anon;
revoke all on function public.configure_room(uuid, text, text, text, integer, integer, integer) from public, anon;
revoke all on function public.start_room(uuid) from public, anon;
revoke all on function public.begin_room_race(uuid, uuid) from public, anon;
revoke all on function public.finish_room_race(uuid, uuid, jsonb) from public, anon;
revoke all on function public.return_room_to_lobby(uuid) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;
revoke all on function public.list_public_rooms() from public, anon;
revoke all on function public.get_room_state(uuid) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.create_room(text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.join_room(uuid, text) to authenticated;
grant execute on function public.set_room_connection(uuid, text) to authenticated;
grant execute on function public.room_heartbeat(uuid) to authenticated;
grant execute on function public.set_room_ready(uuid, boolean) to authenticated;
grant execute on function public.configure_room(uuid, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.start_room(uuid) to authenticated;
grant execute on function public.begin_room_race(uuid, uuid) to authenticated;
grant execute on function public.finish_room_race(uuid, uuid, jsonb) to authenticated;
grant execute on function public.return_room_to_lobby(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.list_public_rooms() to authenticated;
grant execute on function public.get_room_state(uuid) to authenticated;

-- Supabase Realtime Postgres Changes publication: idempotently add the lobby
-- tables if they are not already present in the managed publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
      alter publication supabase_realtime add table public.rooms;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players') then
      alter publication supabase_realtime add table public.room_players;
    end if;
  end if;
end;
$$;
