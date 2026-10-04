begin;

create extension if not exists vector with schema extensions;

alter table public.stageselect_games
add column if not exists recommendation_document text,
add column if not exists recommendation_document_hash text;

alter table public.stageselect_games
drop constraint if exists stageselect_games_recommendation_document_hash_check;

alter table public.stageselect_games
add constraint stageselect_games_recommendation_document_hash_check
check (
  (
    recommendation_document is null
    and recommendation_document_hash is null
  )
  or (
    length(recommendation_document) > 0
    and recommendation_document_hash ~ '^[0-9a-f]{64}$'
  )
);

create table if not exists public.stageselect_game_embeddings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.stageselect_games(id) on delete cascade,
  model text not null check (length(model) between 1 and 100),
  model_version text not null check (length(model_version) between 1 and 150),
  document_version text not null check (length(document_version) between 1 and 100),
  dimensions integer not null check (dimensions = 384),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(384),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 10),
  error text,
  requested_at timestamptz not null default now(),
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, model, model_version),
  check (
    (
      status = 'ready'
      and embedding is not null
      and embedded_at is not null
      and error is null
    )
    or (
      status <> 'ready'
      and embedding is null
      and embedded_at is null
    )
  )
);

create index if not exists stageselect_game_embeddings_status_requested_idx
on public.stageselect_game_embeddings (status, requested_at)
where status in ('pending', 'failed');

create index if not exists stageselect_game_embeddings_game_idx
on public.stageselect_game_embeddings (game_id);

drop trigger if exists stageselect_game_embeddings_set_updated_at
on public.stageselect_game_embeddings;
create trigger stageselect_game_embeddings_set_updated_at
before update on public.stageselect_game_embeddings
for each row execute function public.set_updated_at();

create or replace function public.queue_stageselect_game_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recommendation_document is null
    or new.recommendation_document_hash is null
  then
    return new;
  end if;

  insert into public.stageselect_game_embeddings (
    game_id,
    model,
    model_version,
    document_version,
    dimensions,
    content_hash,
    status,
    requested_at
  )
  values (
    new.id,
    'gte-small',
    'supabase-gte-small-mean-normalized-v1',
    'game-metadata-v1',
    384,
    new.recommendation_document_hash,
    'pending',
    now()
  )
  on conflict (game_id, model, model_version)
  do update set
    document_version = excluded.document_version,
    dimensions = excluded.dimensions,
    content_hash = excluded.content_hash,
    embedding = null,
    status = 'pending',
    attempt_count = 0,
    error = null,
    requested_at = now(),
    embedded_at = null
  where public.stageselect_game_embeddings.content_hash
    is distinct from excluded.content_hash;

  return new;
end;
$$;

revoke all on function public.queue_stageselect_game_embedding() from public;
revoke all on function public.queue_stageselect_game_embedding() from anon;
revoke all on function public.queue_stageselect_game_embedding() from authenticated;

drop trigger if exists queue_stageselect_game_embedding_on_document_change
on public.stageselect_games;
create trigger queue_stageselect_game_embedding_on_document_change
after insert or update of recommendation_document_hash
on public.stageselect_games
for each row
execute function public.queue_stageselect_game_embedding();

alter table public.stageselect_game_embeddings enable row level security;

create or replace function public.claim_stageselect_embedding_jobs(
  batch_size integer default 10
)
returns table (
  embedding_id uuid,
  game_id uuid,
  recommendation_document text,
  content_hash text
)
language sql
security definer
set search_path = ''
as $$
  with claimable as (
    select
      embedding.id,
      embedding.game_id,
      game.recommendation_document,
      embedding.content_hash
    from public.stageselect_game_embeddings embedding
    join public.stageselect_games game on game.id = embedding.game_id
    where embedding.model = 'gte-small'
      and embedding.model_version = 'supabase-gte-small-mean-normalized-v1'
      and embedding.document_version = 'game-metadata-v1'
      and embedding.content_hash = game.recommendation_document_hash
      and game.recommendation_document is not null
      and embedding.attempt_count < 5
      and (
        embedding.status in ('pending', 'failed')
        or (
          embedding.status = 'processing'
          and embedding.updated_at < now() - interval '10 minutes'
        )
      )
    order by embedding.requested_at, embedding.id
    for update of embedding skip locked
    limit least(greatest(coalesce(batch_size, 10), 1), 20)
  ),
  claimed as (
    update public.stageselect_game_embeddings embedding
    set
      status = 'processing',
      attempt_count = embedding.attempt_count + 1,
      error = null
    from claimable
    where embedding.id = claimable.id
    returning
      embedding.id,
      embedding.game_id,
      claimable.recommendation_document,
      embedding.content_hash
  )
  select
    claimed.id as embedding_id,
    claimed.game_id,
    claimed.recommendation_document,
    claimed.content_hash
  from claimed;
$$;

revoke all on function public.claim_stageselect_embedding_jobs(integer)
from public;
revoke all on function public.claim_stageselect_embedding_jobs(integer)
from anon;
revoke all on function public.claim_stageselect_embedding_jobs(integer)
from authenticated;
grant execute on function public.claim_stageselect_embedding_jobs(integer)
to service_role;

comment on table public.stageselect_game_embeddings is
'Versioned, server-managed semantic vectors for shared StageSelect game metadata.';

comment on column public.stageselect_game_embeddings.embedding is
'384-dimensional normalized gte-small embedding. Kept server-only by RLS.';

commit;
