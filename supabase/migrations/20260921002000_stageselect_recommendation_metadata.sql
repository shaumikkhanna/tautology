begin;

alter table public.stageselect_games
add column if not exists themes jsonb not null default '[]'::jsonb,
add column if not exists keywords jsonb not null default '[]'::jsonb,
add column if not exists game_modes jsonb not null default '[]'::jsonb,
add column if not exists player_perspectives jsonb not null default '[]'::jsonb,
add column if not exists similar_game_igdb_ids jsonb not null default '[]'::jsonb,
add column if not exists total_rating numeric,
add column if not exists total_rating_count integer,
add column if not exists game_type integer;

commit;
