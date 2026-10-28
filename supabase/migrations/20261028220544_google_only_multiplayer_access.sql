-- Restrict all multiplayer reads, room RPCs, and Realtime topics to users
-- whose signed Supabase JWT contains a Google provider identity. A UI-only
-- check is not an authorization boundary.

create or replace function public.is_google_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.jwt() ->> 'is_anonymous' is distinct from 'true'
    and (
      coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
      or auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    ),
    false
  );
$$;

create or replace function public.require_google_user()
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_google_user() then
    raise exception using errcode = '42501', message = 'google_account_required';
  end if;
end;
$$;

revoke all on function public.is_google_user() from public, anon;
revoke all on function public.require_google_user() from public, anon;
grant execute on function public.is_google_user() to authenticated;
grant execute on function public.require_google_user() to authenticated;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_google_user() and exists (
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
  select public.is_google_user() and exists (
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
  select public.is_google_user() and (
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
  if not public.is_google_user() or p_topic !~ '^room:[0-9a-fA-F-]{36}$' then
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
    or not public.is_google_user()
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

-- Keep the public table policies role-scoped and additionally require the
-- server-signed Google provider claim. Anonymous and email-only users fail.
drop policy if exists profiles_read_self_or_room on public.profiles;
create policy profiles_read_self_or_room
  on public.profiles for select to authenticated
  using (public.is_google_user() and public.can_view_profile(id));
drop policy if exists rooms_read_public_or_member on public.rooms;
create policy rooms_read_public_or_member
  on public.rooms for select to authenticated
  using (
    public.is_google_user() and (
      (visibility = 'public' and status in ('waiting', 'countdown', 'racing', 'results'))
      or public.is_room_member(id)
    )
  );
drop policy if exists room_players_read_visible_room on public.room_players;
create policy room_players_read_visible_room
  on public.room_players for select to authenticated
  using (public.is_google_user() and public.can_view_room(room_id));
drop policy if exists race_results_read_room_members on public.race_results;
create policy race_results_read_room_members
  on public.race_results for select to authenticated
  using (public.is_google_user() and public.is_room_member(room_id));

-- Realtime policies invoke the Google-gated helpers above. Drop/create them
-- again to make the migration's final policy definition explicit.
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

-- Preserve the vetted transactional implementations as private internals;
-- replace their public RPC names with Google-guarded SECURITY DEFINER wrappers.
alter function public.set_display_name(text) rename to set_display_name_google_internal;
alter function public.create_room(text, text, text, integer, integer, integer) rename to create_room_google_internal;
alter function public.join_room(uuid, text) rename to join_room_google_internal;
alter function public.set_room_connection(uuid, text) rename to set_room_connection_google_internal;
alter function public.room_heartbeat(uuid) rename to room_heartbeat_google_internal;
alter function public.set_room_ready(uuid, boolean) rename to set_room_ready_google_internal;
alter function public.configure_room(uuid, text, text, text, integer, integer, integer) rename to configure_room_google_internal;
alter function public.start_room(uuid) rename to start_room_google_internal;
alter function public.begin_room_race(uuid, uuid) rename to begin_room_race_google_internal;
alter function public.finish_room_race(uuid, uuid, jsonb) rename to finish_room_race_google_internal;
alter function public.return_room_to_lobby(uuid) rename to return_room_to_lobby_google_internal;
alter function public.leave_room(uuid) rename to leave_room_google_internal;
alter function public.list_public_rooms() rename to list_public_rooms_google_internal;
alter function public.get_room_state(uuid) rename to get_room_state_google_internal;

revoke all on function public.set_display_name_google_internal(text) from public, anon, authenticated;
revoke all on function public.create_room_google_internal(text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.join_room_google_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.set_room_connection_google_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.room_heartbeat_google_internal(uuid) from public, anon, authenticated;
revoke all on function public.set_room_ready_google_internal(uuid, boolean) from public, anon, authenticated;
revoke all on function public.configure_room_google_internal(uuid, text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.start_room_google_internal(uuid) from public, anon, authenticated;
revoke all on function public.begin_room_race_google_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_room_race_google_internal(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.return_room_to_lobby_google_internal(uuid) from public, anon, authenticated;
revoke all on function public.leave_room_google_internal(uuid) from public, anon, authenticated;
revoke all on function public.list_public_rooms_google_internal() from public, anon, authenticated;
revoke all on function public.get_room_state_google_internal(uuid) from public, anon, authenticated;

create or replace function public.set_display_name(p_display_name text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.set_display_name_google_internal(p_display_name);
end; $$;

create or replace function public.create_room(
  p_name text, p_visibility text, p_track_id text, p_lap_count integer,
  p_max_players integer, p_bot_count integer default 0
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.create_room_google_internal(p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.join_room(p_room_id uuid default null, p_code text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.join_room_google_internal(p_room_id, p_code);
end; $$;

create or replace function public.set_room_connection(p_room_id uuid, p_status text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.set_room_connection_google_internal(p_room_id, p_status);
end; $$;

create or replace function public.room_heartbeat(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.room_heartbeat_google_internal(p_room_id);
end; $$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.set_room_ready_google_internal(p_room_id, p_ready);
end; $$;

create or replace function public.configure_room(
  p_room_id uuid, p_name text, p_visibility text, p_track_id text,
  p_lap_count integer, p_max_players integer, p_bot_count integer
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.configure_room_google_internal(p_room_id, p_name, p_visibility, p_track_id, p_lap_count, p_max_players, p_bot_count);
end; $$;

create or replace function public.start_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.start_room_google_internal(p_room_id);
end; $$;

create or replace function public.begin_room_race(p_room_id uuid, p_race_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.begin_room_race_google_internal(p_room_id, p_race_id);
end; $$;

create or replace function public.finish_room_race(p_room_id uuid, p_race_id uuid, p_results jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.finish_room_race_google_internal(p_room_id, p_race_id, p_results);
end; $$;

create or replace function public.return_room_to_lobby(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.return_room_to_lobby_google_internal(p_room_id);
end; $$;

create or replace function public.leave_room(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.leave_room_google_internal(p_room_id);
end; $$;

create or replace function public.list_public_rooms()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.list_public_rooms_google_internal();
end; $$;

create or replace function public.get_room_state(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$ begin
  perform public.require_google_user();
  return public.get_room_state_google_internal(p_room_id);
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
