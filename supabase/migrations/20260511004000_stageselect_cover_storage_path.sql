do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stageselect_games'
      and column_name = 'cover_r2_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stageselect_games'
      and column_name = 'cover_storage_path'
  ) then
    alter table public.stageselect_games
    rename column cover_r2_key to cover_storage_path;
  end if;
end $$;

alter table public.stageselect_games
add column if not exists cover_storage_path text;
