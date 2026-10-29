-- Keep one validated career save per authenticated Google account. Clients
-- can access it only through guarded RPCs; there is no direct table access.
create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint player_saves_object check (jsonb_typeof(save_data) = 'object')
);

comment on table public.player_saves is
  'One account-bound Apex Dynasty career save; read/write through Google-guarded RPCs only.';
comment on column public.player_saves.revision is
  'Monotonic optimistic-concurrency revision; stale writes cannot overwrite a newer cloud save.';

alter table public.player_saves enable row level security;
revoke all on table public.player_saves from public, anon, authenticated;

drop policy if exists player_saves_read_own_google on public.player_saves;
create policy player_saves_read_own_google
  on public.player_saves for select to authenticated
  using (public.is_google_user() and user_id = auth.uid());

create or replace function public.load_player_save()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_save jsonb;
begin
  perform public.require_google_user();
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
  perform public.require_google_user();

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

comment on function public.load_player_save() is
  'Returns only the signed-in Google user’s career save; null when no cloud save exists.';
comment on function public.save_player_save(jsonb, bigint) is
  'Creates or revision-checks the signed-in Google user’s career save; no stale write can overwrite a newer revision.';
