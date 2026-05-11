alter table public.stageselect_user_games
add column if not exists platform text not null default 'Unknown';

create index if not exists stageselect_user_games_user_platform_idx
on public.stageselect_user_games (user_id, platform);
