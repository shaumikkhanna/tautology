create table public.crossword_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crossword_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crossword_id text not null,
  grid_state jsonb not null default '{}'::jsonb,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  checked_count integer not null default 0 check (checked_count >= 0),
  revealed_count integer not null default 0 check (revealed_count >= 0),
  completed_at timestamptz,
  perfect boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, crossword_id)
);

create index crossword_progress_user_completed_idx
on public.crossword_progress (user_id, completed_at);

create trigger crossword_approvals_set_updated_at
before update on public.crossword_approvals
for each row execute function public.set_updated_at();

create trigger crossword_progress_set_updated_at
before update on public.crossword_progress
for each row execute function public.set_updated_at();

alter table public.crossword_approvals enable row level security;
alter table public.crossword_progress enable row level security;

create policy "Users can read their own crossword approval"
on public.crossword_approvals for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their own crossword progress"
on public.crossword_progress for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own crossword progress"
on public.crossword_progress for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own crossword progress"
on public.crossword_progress for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own crossword progress"
on public.crossword_progress for delete
to authenticated
using (auth.uid() = user_id);
