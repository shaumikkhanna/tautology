begin;

create table if not exists public.stageselect_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_version text not null check (length(model_version) between 1 and 100),
  feature_schema_version text not null check (length(feature_schema_version) between 1 and 100),
  candidate_generation_version text not null check (length(candidate_generation_version) between 1 and 100),
  surface text not null check (surface in ('play_next', 'discover')),
  controls jsonb not null default '{}'::jsonb check (jsonb_typeof(controls) = 'object'),
  candidate_count integer not null check (candidate_count between 0 and 1000),
  generated_at timestamptz not null default now()
);

create table if not exists public.stageselect_recommendation_impressions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stageselect_recommendation_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  rank integer not null check (rank between 1 and 24),
  candidate_source text not null check (
    candidate_source in (
      'library_queue',
      'similar_games',
      'preference_facets',
      'similar_games+preference_facets',
      'related_fallback'
    )
  ),
  final_score numeric not null check (final_score between 0 and 1),
  score_components jsonb not null default '{}'::jsonb
    check (jsonb_typeof(score_components) = 'object'),
  explanation_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(explanation_evidence) = 'object'),
  shown_at timestamptz not null default now(),
  acted_at timestamptz,
  action public.stageselect_recommendation_action,
  unique (run_id, rank),
  unique (run_id, game_id)
);

alter table public.stageselect_recommendation_feedback
add column if not exists recommendation_id uuid
references public.stageselect_recommendation_impressions(id) on delete set null;

create index if not exists stageselect_recommendation_runs_user_generated_idx
on public.stageselect_recommendation_runs (user_id, generated_at desc);

create index if not exists stageselect_recommendation_impressions_run_rank_idx
on public.stageselect_recommendation_impressions (run_id, rank);

create index if not exists stageselect_recommendation_impressions_user_game_idx
on public.stageselect_recommendation_impressions (user_id, game_id, shown_at desc);

alter table public.stageselect_recommendation_runs enable row level security;
alter table public.stageselect_recommendation_impressions enable row level security;

drop policy if exists "Users can read their own recommendation runs"
on public.stageselect_recommendation_runs;
create policy "Users can read their own recommendation runs"
on public.stageselect_recommendation_runs for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own recommendation runs"
on public.stageselect_recommendation_runs;
create policy "Users can create their own recommendation runs"
on public.stageselect_recommendation_runs for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own recommendation runs"
on public.stageselect_recommendation_runs;
create policy "Users can remove their own recommendation runs"
on public.stageselect_recommendation_runs for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read their own recommendation impressions"
on public.stageselect_recommendation_impressions;
create policy "Users can read their own recommendation impressions"
on public.stageselect_recommendation_impressions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own recommendation impressions"
on public.stageselect_recommendation_impressions;
create policy "Users can create their own recommendation impressions"
on public.stageselect_recommendation_impressions for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.stageselect_recommendation_runs run
    where run.id = run_id and run.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own recommendation impressions"
on public.stageselect_recommendation_impressions;
create policy "Users can update their own recommendation impressions"
on public.stageselect_recommendation_impressions for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.stageselect_recommendation_runs run
    where run.id = run_id and run.user_id = auth.uid()
  )
);

drop policy if exists "Users can create their own recommendation feedback"
on public.stageselect_recommendation_feedback;
create policy "Users can create their own recommendation feedback"
on public.stageselect_recommendation_feedback for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    recommendation_id is null
    or exists (
      select 1
      from public.stageselect_recommendation_impressions impression
      where impression.id = recommendation_id
        and impression.user_id = auth.uid()
        and impression.game_id = stageselect_recommendation_feedback.game_id
    )
  )
);

commit;
