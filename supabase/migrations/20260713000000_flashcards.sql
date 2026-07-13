create table public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcard_sets_user_updated_idx
on public.flashcard_sets (user_id, updated_at desc);

create index flashcards_set_created_idx
on public.flashcards (set_id, created_at asc);

create trigger flashcard_sets_set_updated_at
before update on public.flashcard_sets
for each row execute function public.set_updated_at();

create trigger flashcards_set_updated_at
before update on public.flashcards
for each row execute function public.set_updated_at();

alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;

create policy "Users can read their own flashcard sets"
on public.flashcard_sets for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own flashcard sets"
on public.flashcard_sets for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own flashcard sets"
on public.flashcard_sets for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own flashcard sets"
on public.flashcard_sets for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their own flashcards"
on public.flashcards for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create cards in their own sets"
on public.flashcards for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.flashcard_sets
    where flashcard_sets.id = flashcards.set_id
      and flashcard_sets.user_id = auth.uid()
  )
);

create policy "Users can update their own flashcards"
on public.flashcards for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.flashcard_sets
    where flashcard_sets.id = flashcards.set_id
      and flashcard_sets.user_id = auth.uid()
  )
);

create policy "Users can delete their own flashcards"
on public.flashcards for delete
to authenticated
using (auth.uid() = user_id);
