create extension if not exists pgcrypto;

create type public.stageselect_game_status as enum (
  'finished',
  'left',
  'playing',
  'backlogged',
  'wishlisted'
);

create type public.stageselect_review_visibility as enum (
  'private',
  'public'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stageselect_games (
  id uuid primary key default gen_random_uuid(),
  igdb_id integer not null unique,
  slug text unique,
  title text not null,
  summary text,
  cover_url text,
  cover_storage_path text,
  release_date date,
  platforms jsonb not null default '[]'::jsonb,
  genres jsonb not null default '[]'::jsonb,
  igdb_raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stageselect_user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  status public.stageselect_game_status not null,
  started_at date,
  finished_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table public.stageselect_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  rating numeric(2, 1) check (rating is null or (rating >= 0.5 and rating <= 5)),
  body text,
  visibility public.stageselect_review_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create index stageselect_games_title_idx on public.stageselect_games using gin (to_tsvector('english', title));
create index stageselect_user_games_user_status_idx on public.stageselect_user_games (user_id, status);
create index stageselect_reviews_game_visibility_idx on public.stageselect_reviews (game_id, visibility);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger stageselect_games_set_updated_at
before update on public.stageselect_games
for each row execute function public.set_updated_at();

create trigger stageselect_user_games_set_updated_at
before update on public.stageselect_user_games
for each row execute function public.set_updated_at();

create trigger stageselect_reviews_set_updated_at
before update on public.stageselect_reviews
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.stageselect_games enable row level security;
alter table public.stageselect_user_games enable row level security;
alter table public.stageselect_reviews enable row level security;

create policy "Profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Games are publicly readable"
on public.stageselect_games for select
to anon, authenticated
using (true);

create policy "Users can read their own library"
on public.stageselect_user_games for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can add games to their own library"
on public.stageselect_user_games for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own library"
on public.stageselect_user_games for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can remove games from their own library"
on public.stageselect_user_games for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their own reviews and public reviews"
on public.stageselect_reviews for select
to authenticated
using (auth.uid() = user_id or visibility = 'public');

create policy "Anonymous users can read public reviews"
on public.stageselect_reviews for select
to anon
using (visibility = 'public');

create policy "Users can create their own reviews"
on public.stageselect_reviews for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own reviews"
on public.stageselect_reviews for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own reviews"
on public.stageselect_reviews for delete
to authenticated
using (auth.uid() = user_id);
