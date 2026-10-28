-- Tighten default Supabase grants: anon cannot select multiplayer records.
revoke all on public.profiles, public.rooms, public.room_players, public.race_results from anon;
