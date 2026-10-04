begin;

create table if not exists public.stageselect_recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  impression_id uuid not null
    references public.stageselect_recommendation_impressions(id)
    on delete cascade,
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  outcome text not null check (
    outcome in ('saved', 'started', 'finished', 'left', 'rated')
  ),
  rating numeric(2, 1),
  attribution_method text not null check (
    attribution_method in ('direct', 'recent_impression')
  ),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (impression_id, outcome),
  check (
    (outcome = 'rated' and rating between 0.5 and 5)
    or (outcome <> 'rated' and rating is null)
  )
);

create index if not exists stageselect_recommendation_outcomes_user_occurred_idx
on public.stageselect_recommendation_outcomes (user_id, occurred_at desc);

create index if not exists stageselect_recommendation_outcomes_game_outcome_idx
on public.stageselect_recommendation_outcomes (game_id, outcome);

alter table public.stageselect_recommendation_outcomes enable row level security;

drop policy if exists "Users can read their own recommendation outcomes"
on public.stageselect_recommendation_outcomes;
create policy "Users can read their own recommendation outcomes"
on public.stageselect_recommendation_outcomes for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own recommendation outcomes"
on public.stageselect_recommendation_outcomes;
create policy "Users can create their own recommendation outcomes"
on public.stageselect_recommendation_outcomes for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.stageselect_recommendation_impressions as impression
    where impression.id = stageselect_recommendation_outcomes.impression_id
      and impression.user_id = auth.uid()
      and impression.game_id = stageselect_recommendation_outcomes.game_id
  )
);

drop policy if exists "Users can remove their own recommendation outcomes"
on public.stageselect_recommendation_outcomes;
create policy "Users can remove their own recommendation outcomes"
on public.stageselect_recommendation_outcomes for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.stageselect_recommendation_outcomes is
'Private observed outcomes attributed to StageSelect recommendation impressions. These records support measurement but do not establish causality.';

comment on column public.stageselect_recommendation_outcomes.attribution_method is
'direct means the recommendation impression accompanied the action; recent_impression uses the latest matching impression inside the application attribution window.';

commit;
