-- Email/password accounts replace Google OAuth entirely.
--
-- Every multiplayer, cloud-save and Realtime guard now accepts any confirmed
-- (non-anonymous) Supabase Auth user created with e-mail + password. The old
-- Google-only helpers are dropped. The profiles table gains a unique
-- username, the auth.users trigger stores it from signup metadata, and new
-- RPCs support username login, availability checks and username changes.
-- Passwords are never stored in public tables: Supabase Auth keeps them
-- hashed inside auth.users, which clients cannot read.

-- ---------------------------------------------------------------------------
-- 1. Unique username on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;

-- Legacy rows (if any) receive a deterministic unique username derived from
-- their UUID so the NOT NULL + UNIQUE constraints below can be applied safely.
update public.profiles
set username = 'pilot_' || lower(substring(replace(id::text, '-', '') from 1 for 8))
where username is null or char_length(username) < 3;

alter table public.profiles alter column username set not null;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-zA-Z0-9_]{3,20}$');
alter table public.profiles
  add constraint profiles_username_unique unique (username);
create index if not exists profiles_username_idx on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- 2. Confirmation gate: any confirmed e-mail account, no provider restriction
-- ---------------------------------------------------------------------------
create or replace function public.is_confirmed_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'is_anonymous' is distinct from 'true', false);
$$;

create or replace function public.require_confirmed_user()
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_confirmed_user() then
    raise exception using errcode = '42501', message = 'email_account_required';
  end if;
end;
$$;

revoke all on function public.is_confirmed_user() from public, anon;
revoke all on function public.require_confirmed_user() from public, anon;
grant execute on function public.is_confirmed_user() to authenticated;
grant execute on function public.require_confirmed_user() to authenticated;

-- Google-era helpers are removed completely.
drop function if exists public.is_google_user();
drop function if exists public.require_google_user();

-- ---------------------------------------------------------------------------
-- 3. Room/profile helpers now key off the confirmed-account gate
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_confirmed_user() and exists (
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
  select public.is_confirmed_user() and exists (
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
  select public.is_confirmed_user() and (
    p_profile_id = auth.uid() or exists (
      select 1
      from public.room_players rp
      where rp.player_id = p_profile_id
        and rp.left_at is null
        and public.is_room_member(rp.room_id)
    )
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
  if not public.is_confirmed_user() or p_topic !~ '^room:[0-9a-fA-F-]{36}$' then
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
  if v_actor is null
    or not public.is_confirmed_user()
    or not public.can_access_room_topic(p_topic) then
    return false;
  end if;
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

  return true;
exception when invalid_text_representation then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row-level and Realtime policies keyed to confirmed accounts
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read_self_or_room on public.profiles;
create policy profiles_read_self_or_room
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
-- The owner may also update their own profile row (display name / avatar);
-- username changes go through the guarded RPC below.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (public.is_confirmed_user() and id = auth.uid())
  with check (public.is_confirmed_user() and id = auth.uid());
drop policy if exists rooms_read_public_or_member on public.rooms;
create policy rooms_read_public_or_member
  on public.rooms for select to authenticated
  using (
    public.is_confirmed_user() and (
      (visibility = 'public' and status in ('waiting', 'countdown', 'racing', 'results'))
      or public.is_room_member(id)
    )
  );
drop policy if exists room_players_read_visible_room on public.room_players;
create policy room_players_read_visible_room
  on public.room_players for select to authenticated
  using (public.is_confirmed_user() and public.can_view_room(room_id));
drop policy if exists race_results_read_room_members on public.race_results;
create policy race_results_read_room_members
  on public.race_results for select to authenticated
  using (public.is_confirmed_user() and public.is_room_member(room_id));

drop policy if exists apex_room_realtime_read on realtime.messages;
create policy apex_room_realtime_read
  on realtime.messages for select to authenticated
  using (public.can_access_room_topic((select realtime.topic())));
drop policy if exists apex_room_realtime_send on realtime.messages;
create policy apex_room_realtime_send
  on realtime.messages for insert to authenticated
  with check (
    public.can_send_room_event((select realtime.topic()), event, payload)
  );

-- ---------------------------------------------------------------------------
-- 5. Profile creation trigger stores the unique username from signup metadata
-- ---------------------------------------------------------------------------
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_name := regexp_replace(v_name, '[[:cntrl:]]', '', 'g');
  if char_length(v_name) < 2 then
    v_name := 'Piloto ' || upper(substring(replace(new.id::text, '-', '') from 1 for 5));
  end if;

  v_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) < 3 or char_length(v_username) > 20 then
    raise exception using errcode = '22023', message = 'username_invalid';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception using errcode = '23505', message = 'username_taken';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, left(v_name, 24))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Account RPCs for username login and username changes
-- ---------------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_username, '') ~ '^[a-zA-Z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles where username = lower(p_username)
    );
$$;

-- Resolves the account e-mail for a username so the client can call
-- signInWithPassword. Only the e-mail is exposed, never any credential.
create or replace function public.email_for_username(p_username text)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(p_username);
$$;

create or replace function public.set_username(p_username text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := auth.uid();
  v_username text;
  v_profile public.profiles;
begin
  perform public.require_confirmed_user();
  v_username := lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) < 3 or char_length(v_username) > 20 then
    raise exception using errcode = '22023', message = 'username_invalid';
  end if;
  if exists (select 1 from public.profiles where username = v_username and id <> v_id) then
    raise exception using errcode = '23505', message = 'username_taken';
  end if;
  update public.profiles
    set username = v_username, updated_at = clock_timestamp()
    where id = v_id
    returning * into v_profile;
  if not found then raise exception 'profile_not_found'; end if;
  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function public.username_available(text) from public, authenticated;
revoke all on function public.email_for_username(text) from public, authenticated;
revoke all on function public.set_username(text) from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.email_for_username(text) to anon, authenticated;
grant execute on function public.set_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Rename the Google-era internal RPCs back to neutral names and re-wrap
--    every public RPC with the confirmed-account guard
-- ---------------------------------------------------------------------------
alter function if exists public.set_display_name_google_internal(text) rename to set_display_name_internal;
alter function if exists public.create_room_google_internal(text, text, text, integer, integer, integer) rename to create_room_internal;
alter function if exists public.join_room_google_internal(uuid, text) rename to join_room_internal;
alter function if exists public.set_room_connection_google_internal(uuid, text) rename to set_room_connection_internal;
alter function if exists public.room_heartbeat_google_internal(uuid) rename to room_heartbeat_internal;
alter function if exists public.set_room_ready_google_internal(uuid, boolean) rename to set_room_ready_internal;
alter function if exists public.configure_room_google_internal(uuid, text, text, text, integer, integer, integer) rename to configure_room_internal;
alter function if exists public.start_room_google_internal(uuid) rename to start_room_internal;
alter function if exists public.begin_room_race_google_internal(uuid, uuid) rename to begin_room_race_internal;
alter function if exists public.finish_room_race_google_internal(uuid, uuid, jsonb) rename to finish_room_race_internal;
alter function if exists public.return_room_to_lobby_google_internal(uuid) rename to return_room_to_lobby_internal;
alter function if exists public.leave_room_google_internal(uuid) rename to leave_room_internal;
alter function if exists public.list_public_rooms_google_internal() rename to list_public_rooms_internal;
alter function if exists public.get_room_state_google_internal(uuid) rename to get_room_state_internal;

create or replace function public.set_display_name(p_display_name text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.set_display_name_internal(p_display_name);
end; $$;

create or replace function public.create_room(
  p_name text, p_visibility text, p_track_id text, p_lap_count integer,
  p_max_players integer, p_bot_count integer default 0
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.create_room_internal(p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.join_room(p_room_id uuid default null, p_code text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.join_room_internal(p_room_id, p_code);
end; $$;

create or replace function public.set_room_connection(p_room_id uuid, p_status text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.set_room_connection_internal(p_room_id, p_status);
end; $$;

create or replace function public.room_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.room_heartbeat_internal(p_room_id);
end; $$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.set_room_ready_internal(p_room_id, p_ready);
end; $$;

create or replace function public.configure_room(
  p_room_id uuid, p_name text, p_visibility text, p_track_id text,
  p_lap_count integer, p_max_players integer, p_bot_count integer
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.configure_room_internal(p_room_id, p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.start_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.start_room_internal(p_room_id);
end; $$;

create or replace function public.begin_room_race(p_room_id uuid, p_race_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.begin_room_race_internal(p_room_id, p_race_id);
end; $$;

create or replace function public.finish_room_race(p_room_id uuid, p_race_id uuid, p_results jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.finish_room_race_internal(p_room_id, p_race_id, p_results);
end; $$;

create or replace function public.return_room_to_lobby(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.return_room_to_lobby_internal(p_room_id);
end; $$;

create or replace function public.leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.leave_room_internal(p_room_id);
end; $$;

create or replace function public.list_public_rooms()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.list_public_rooms_internal();
end; $$;

create or replace function public.get_room_state(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_confirmed_user();
  return public.get_room_state_internal(p_room_id);
end; $$;

revoke all on function public.set_display_name(text) from public, anon;
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

-- ---------------------------------------------------------------------------
-- 8. Cloud career saves follow the same confirmed-account gate
-- ---------------------------------------------------------------------------
drop policy if exists player_saves_read_own_google on public.player_saves;
drop policy if exists player_saves_read_own_confirmed on public.player_saves;
create policy player_saves_read_own_confirmed
  on public.player_saves for select to authenticated
  using (public.is_confirmed_user() and user_id = auth.uid());

create or replace function public.load_player_save()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_save jsonb;
begin
  perform public.require_confirmed_user();
  select jsonb_build_object(
    'save_data', ps.save_data,
    'revision', ps.revision,
    'updated_at', ps.updated_at
  )
  into v_save
  from public.player_saves ps
  where ps.user_id = auth.uid();
  return v_save;
end;
$$;

create or replace function public.save_player_save(
  p_save jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_revision bigint;
  v_updated_at timestamptz;
begin
  perform public.require_confirmed_user();

  if p_save is null
    or jsonb_typeof(p_save) is distinct from 'object'
    or p_save ->> 'version' is distinct from '1' then
    raise exception using errcode = '22023', message = 'cloud_save_invalid';
  end if;
  if pg_column_size(p_save) > 8388608 then
    raise exception using errcode = '22023', message = 'cloud_save_too_large';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'save_revision_invalid';
  end if;

  if p_expected_revision = 0 then
    insert into public.player_saves (user_id, save_data, revision, updated_at)
    values (v_user, p_save, 1, clock_timestamp())
    on conflict (user_id) do nothing
    returning revision, updated_at into v_revision, v_updated_at;
  else
    update public.player_saves ps
      set save_data = p_save,
          revision = ps.revision + 1,
          updated_at = clock_timestamp()
      where ps.user_id = v_user
        and ps.revision = p_expected_revision
      returning ps.revision, ps.updated_at into v_revision, v_updated_at;
  end if;

  if not found then
    raise exception using errcode = '40001', message = 'save_revision_conflict';
  end if;

  return jsonb_build_object(
    'revision', v_revision,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.load_player_save() from public, anon, authenticated;
revoke all on function public.save_player_save(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.load_player_save() to authenticated;
grant execute on function public.save_player_save(jsonb, bigint) to authenticated;

comment on table public.player_saves is
  'One account-bound Apex Dynasty career save; read/write through confirmed-account-guarded RPCs only.';
comment on function public.load_player_save() is
  'Returns only the signed-in confirmed user’s career save; null when no cloud save exists.';
comment on function public.save_player_save(jsonb, bigint) is
  'Creates or revision-checks the signed-in confirmed user’s career save; no stale write can overwrite a newer revision.';
comment on column public.profiles.username is
  'Unique login username (3-20 chars, [a-zA-Z0-9_]); set at signup and changeable via set_username RPC.';
