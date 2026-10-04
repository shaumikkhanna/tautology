begin;

do $$
begin
  create type public.stageselect_recommendation_action as enum (
    'more_like_this',
    'not_for_me',
    'saved',
    'dismissed'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.stageselect_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  action public.stageselect_recommendation_action not null,
  created_at timestamptz not null default now()
);

create index if not exists stageselect_recommendation_feedback_user_game_idx
on public.stageselect_recommendation_feedback (user_id, game_id, created_at desc);

alter table public.stageselect_recommendation_feedback enable row level security;

drop policy if exists "Users can read their own recommendation feedback"
on public.stageselect_recommendation_feedback;
create policy "Users can read their own recommendation feedback"
on public.stageselect_recommendation_feedback for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own recommendation feedback"
on public.stageselect_recommendation_feedback;
create policy "Users can create their own recommendation feedback"
on public.stageselect_recommendation_feedback for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can clear their own recommendation feedback"
on public.stageselect_recommendation_feedback;
create policy "Users can clear their own recommendation feedback"
on public.stageselect_recommendation_feedback for delete
to authenticated
using (auth.uid() = user_id);

commit;
