create table public.crossword_invites (
  code text primary key,
  email text,
  created_by uuid references auth.users(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  used_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crossword_invites_email_idx
on public.crossword_invites (lower(email));

create trigger crossword_invites_set_updated_at
before update on public.crossword_invites
for each row execute function public.set_updated_at();

alter table public.crossword_invites enable row level security;
