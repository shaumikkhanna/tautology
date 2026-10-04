begin;

create table if not exists public.stageselect_ranking_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface = 'discover'),
  model_version text not null check (length(model_version) between 1 and 100),
  baseline_variant text not null check (
    baseline_variant = 'hybrid-global-profile'
  ),
  candidate_variant text not null check (
    candidate_variant = 'hybrid-multi-interest'
  ),
  controls jsonb not null default '{}'::jsonb
    check (jsonb_typeof(controls) = 'object'),
  candidate_count integer not null check (candidate_count between 1 and 1000),
  comparison_key text not null check (length(comparison_key) between 1 and 100),
  left_variant text not null check (
    left_variant in ('hybrid-global-profile', 'hybrid-multi-interest')
  ),
  right_variant text not null check (
    right_variant in ('hybrid-global-profile', 'hybrid-multi-interest')
  ),
  left_game_igdb_ids bigint[] not null check (
    cardinality(left_game_igdb_ids) between 1 and 6
  ),
  right_game_igdb_ids bigint[] not null check (
    cardinality(right_game_igdb_ids) between 1 and 6
  ),
  choice text not null check (choice in ('left', 'right', 'tie')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, comparison_key),
  check (left_variant <> right_variant),
  check (
    left_variant in (baseline_variant, candidate_variant)
    and right_variant in (baseline_variant, candidate_variant)
  )
);

create index if not exists stageselect_ranking_evaluations_user_created_idx
on public.stageselect_ranking_evaluations (user_id, created_at desc);

drop trigger if exists stageselect_ranking_evaluations_set_updated_at
on public.stageselect_ranking_evaluations;
create trigger stageselect_ranking_evaluations_set_updated_at
before update on public.stageselect_ranking_evaluations
for each row execute function public.set_updated_at();

alter table public.stageselect_ranking_evaluations enable row level security;

drop policy if exists "Users can read their own ranking evaluations"
on public.stageselect_ranking_evaluations;
create policy "Users can read their own ranking evaluations"
on public.stageselect_ranking_evaluations for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own ranking evaluations"
on public.stageselect_ranking_evaluations;
create policy "Users can create their own ranking evaluations"
on public.stageselect_ranking_evaluations for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own ranking evaluations"
on public.stageselect_ranking_evaluations;
create policy "Users can update their own ranking evaluations"
on public.stageselect_ranking_evaluations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own ranking evaluations"
on public.stageselect_ranking_evaluations;
create policy "Users can remove their own ranking evaluations"
on public.stageselect_ranking_evaluations for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.stageselect_ranking_evaluations is
'Private blind comparisons between the global-profile and multi-interest StageSelect rankers.';

commit;
