-- ============================================================================
-- Apex Dynasty 3D Pro — Anonymous player identity (Supabase Anonymous Sign-Ins)
-- ----------------------------------------------------------------------------
-- NON-DESTRUCTIVE by design:
--   * No table/column/function is dropped. Old gate functions are kept until
--     a later, separate cleanup migration (after verification).
--   * Every RLS policy and RPC keeps its original ownership / room-membership /
--     host authorization logic; ONLY the gate changes from
--     "confirmed e-mail" (is_confirmed_user) to "any authenticated session"
--     (is_authenticated_user), which also accepts anonymous sessions.
--   * Existing e-mail accounts, profiles, saves, rooms and results keep
--     working unchanged (same UUIDs).
--
-- OBJECT ORDER (dependencies first):
--   1. gate functions
--   2. username_attempts table (MUST exist before set_username references it)
--   3. profiles columns (username_claimed, email_linked)
--   4. profile-creation trigger + e-mail-link sync trigger
--   5. room helper functions (gate swap, logic identical)
--   6. RLS policies (profiles, rooms, room_players, race_results, player_saves,
--      realtime.messages)
--   7. RPC wrappers (gate swap, internals *_internal untouched)
--   8. username RPCs (username_available, email_for_username, set_username)
--   9. grants/revokes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. GATE FUNCTIONS
-- ----------------------------------------------------------------------------
create or replace function public.is_authenticated_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null;
$$;

create or replace function public.require_authenticated_user()
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_authenticated_user() then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
end;
$$;

revoke all on function public.is_authenticated_user() from public, anon;
revoke all on function public.require_authenticated_user() from public, anon;
grant execute on function public.is_authenticated_user() to authenticated;
grant execute on function public.require_authenticated_user() to authenticated;

-- NOTE: public.is_confirmed_user() and public.require_confirmed_user() are
-- intentionally LEFT IN PLACE; dropped only in a future cleanup migration.

-- ----------------------------------------------------------------------------
-- 2. USERNAME-ATTEMPT THROTTLE TABLE (anti-automation for name claiming).
--    Created BEFORE set_username() so the function never references a missing
--    table. No direct client access: RLS on + revoke all; only SECURITY
--    DEFINER functions write to it.
-- ----------------------------------------------------------------------------
create table if not exists public.username_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp()
);
alter table public.username_attempts enable row level security;
revoke all on table public.username_attempts from public, anon, authenticated;
create index if not exists username_attempts_user_time_idx
  on public.username_attempts (user_id, attempted_at desc);

-- ----------------------------------------------------------------------------
-- 3. PROFILES COLUMNS (additive, non-destructive)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username_claimed boolean not null default false;
alter table public.profiles
  add column if not exists email_linked boolean not null default false;

-- Backfill: pre-existing profiles have real usernames -> claimed.
update public.profiles
set username_claimed = true
where username_claimed = false
  and username !~ '^pilot_[0-9a-f]{8}$';

-- ----------------------------------------------------------------------------
-- 4. PROFILE-CREATION TRIGGER
--    - signup WITH username metadata (legacy e-mail flow): validated, claimed.
--    - anonymous signup (no metadata): unique placeholder pilot_<8hex>,
--      username_claimed = false -> client shows the identity screen.
--    - on conflict (id) do nothing: linking an e-mail later NEVER duplicates
--      the profile (PK is the auth UUID).
-- ----------------------------------------------------------------------------
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_name) < 2 then
    v_name := 'Piloto ' || upper(substring(replace(new.id::text, '-', '') from 1 for 5));
  end if;

  v_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) between 3 and 20 then
    if exists (select 1 from public.profiles where username = v_username) then
      raise exception using errcode = '23505', message = 'username_taken';
    end if;
    insert into public.profiles (id, username, display_name, username_claimed, email_linked)
    values (new.id, v_username, left(v_name, 24), true, coalesce(new.email is not null, false))
    on conflict (id) do nothing;
  else
    v_username := 'pilot_' || lower(substring(replace(new.id::text, '-', '') from 1 for 8));
    insert into public.profiles (id, username, display_name, username_claimed, email_linked)
    values (new.id, v_username, left(v_name, 24), false, false)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Keep email_linked in sync when an anonymous identity later gets an e-mail
-- (future "protect my account"): same UUID, profile updated in place.
create or replace function public.sync_profile_email_link()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is not null and (old.email is distinct from new.email) then
    update public.profiles
    set email_linked = true, updated_at = clock_timestamp()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_linked on auth.users;
create trigger on_auth_user_email_linked
after update on auth.users
for each row execute function public.sync_profile_email_link();

-- ----------------------------------------------------------------------------
-- 5. ROOM HELPER FUNCTIONS — identical logic, only the gate changes
--    (membership/host/playerId checks preserved verbatim).
-- ----------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_authenticated_user() and exists (
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
  select public.is_authenticated_user() and exists (
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
  select public.is_authenticated_user() and (
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
  if not public.is_authenticated_user() or p_topic !~ '^room:[0-9a-fA-F-]{36}$' then
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
    or not public.is_authenticated_user()
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

-- ----------------------------------------------------------------------------
-- 6. RLS POLICIES — same rules as before, new gate. Ownership checks intact.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_read_self_or_room on public.profiles;
create policy profiles_read_self_or_room
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (public.is_authenticated_user() and id = auth.uid())
  with check (public.is_authenticated_user() and id = auth.uid());

drop policy if exists rooms_read_public_or_member on public.rooms;
create policy rooms_read_public_or_member
  on public.rooms for select to authenticated
  using (
    public.is_authenticated_user() and (
      (visibility = 'public' and status in ('waiting', 'countdown', 'racing', 'results'))
      or public.is_room_member(id)
    )
  );

drop policy if exists room_players_read_visible_room on public.room_players;
create policy room_players_read_visible_room
  on public.room_players for select to authenticated
  using (public.is_authenticated_user() and public.can_view_room(room_id));

drop policy if exists race_results_read_room_members on public.race_results;
create policy race_results_read_room_members
  on public.race_results for select to authenticated
  using (public.is_authenticated_user() and public.is_room_member(room_id));

drop policy if exists player_saves_read_own_confirmed on public.player_saves;
create policy player_saves_read_own_session
  on public.player_saves for select to authenticated
  using (public.is_authenticated_user() and user_id = auth.uid());

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

-- Direct table mutations remain blocked:
revoke insert, update, delete, truncate, references, trigger
  on public.profiles, public.rooms, public.room_players, public.race_results
  from anon, authenticated;
grant select on public.profiles, public.rooms, public.room_players, public.race_results to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC WRAPPERS — bodies identical except require_confirmed_user() ->
--    require_authenticated_user(). Internal *_internal implementations are
--    NOT touched (no rename, no drop).
-- ----------------------------------------------------------------------------
create or replace function public.set_display_name(p_display_name text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.set_display_name_internal(p_display_name);
end; $$;

create or replace function public.create_room(
  p_name text, p_visibility text, p_track_id text, p_lap_count integer,
  p_max_players integer, p_bot_count integer default 0
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.create_room_internal(p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.join_room(p_room_id uuid default null, p_code text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.join_room_internal(p_room_id, p_code);
end; $$;

create or replace function public.set_room_connection(p_room_id uuid, p_status text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.set_room_connection_internal(p_room_id, p_status);
end; $$;

create or replace function public.room_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.room_heartbeat_internal(p_room_id);
end; $$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.set_room_ready_internal(p_room_id, p_ready);
end; $$;

create or replace function public.configure_room(
  p_room_id uuid, p_name text, p_visibility text, p_track_id text,
  p_lap_count integer, p_max_players integer, p_bot_count integer
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.configure_room_internal(p_room_id, p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.start_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.start_room_internal(p_room_id);
end; $$;

create or replace function public.begin_room_race(p_room_id uuid, p_race_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.begin_room_race_internal(p_room_id, p_race_id);
end; $$;

create or replace function public.finish_room_race(p_room_id uuid, p_race_id uuid, p_results jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.finish_room_race_internal(p_room_id, p_race_id, p_results);
end; $$;

create or replace function public.return_room_to_lobby(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.return_room_to_lobby_internal(p_room_id);
end; $$;

create or replace function public.leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.leave_room_internal(p_room_id);
end; $$;

create or replace function public.list_public_rooms()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.list_public_rooms_internal();
end; $$;

create or replace function public.get_room_state(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_authenticated_user();
  return public.get_room_state_internal(p_room_id);
end; $$;

create or replace function public.load_player_save()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_save jsonb;
begin
  perform public.require_authenticated_user();
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
  perform public.require_authenticated_user();

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

  return jsonb_build_object('revision', v_revision, 'updated_at', v_updated_at);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. USERNAME RPCs (set_username AFTER username_attempts exists — section 2)
-- ----------------------------------------------------------------------------
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

-- kept for the legacy e-mail login (secondary option for old accounts)
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
  v_attempts int;
begin
  perform public.require_authenticated_user();

  -- anti-automation throttle for NAME claiming (distinct from identity
  -- creation, which is limited by Supabase Auth rate limits): max 5 attempts
  -- per minute per user.
  delete from public.username_attempts
  where attempted_at < clock_timestamp() - interval '1 hour';
  select count(*) into v_attempts
  from public.username_attempts
  where user_id = v_id
    and attempted_at > clock_timestamp() - interval '1 minute';
  if v_attempts >= 5 then
    raise exception using errcode = '42501', message = 'username_rate_limited';
  end if;
  insert into public.username_attempts (user_id) values (v_id);

  v_username := lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) < 3 or char_length(v_username) > 20 then
    raise exception using errcode = '22023', message = 'username_invalid';
  end if;
  if exists (select 1 from public.profiles where username = v_username and id <> v_id) then
    raise exception using errcode = '23505', message = 'username_taken';
  end if;

  update public.profiles
    set username = v_username,
        username_claimed = true,
        updated_at = clock_timestamp()
    where id = v_id
    returning * into v_profile;
  if not found then raise exception 'profile_not_found'; end if;

  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'username_claimed', v_profile.username_claimed,
    'email_linked', v_profile.email_linked,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. GRANTS / REVOKES
-- ----------------------------------------------------------------------------
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
revoke all on function public.load_player_save() from public, anon, authenticated;
revoke all on function public.save_player_save(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.set_username(text) from public, anon;

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
grant execute on function public.load_player_save() to authenticated;
grant execute on function public.save_player_save(jsonb, bigint) to authenticated;
grant execute on function public.set_username(text) to authenticated;
-- username_available / email_for_username stay callable by anon (needed during
-- identity creation and legacy username login):
revoke all on function public.username_available(text) from public, authenticated;
revoke all on function public.email_for_username(text) from public, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.email_for_username(text) to anon, authenticated;

comment on table public.username_attempts is
  'Anti-automation log for pilot-name claiming; no direct client access, written only by SECURITY DEFINER set_username.';
comment on column public.profiles.username_claimed is
  'false while the username is an auto placeholder (pilot_<hex>); true once the player chose a name.';
comment on column public.profiles.email_linked is
  'true once an e-mail is linked to this identity (future account protection); same auth UUID, no duplicate profile.';
