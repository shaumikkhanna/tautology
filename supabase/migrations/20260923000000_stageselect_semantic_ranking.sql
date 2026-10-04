begin;

create or replace function public.get_stageselect_semantic_scores(
  candidate_game_ids uuid[] default '{}'::uuid[],
  candidate_igdb_ids integer[] default '{}'::integer[]
)
returns table (
  game_id uuid,
  igdb_id integer,
  positive_similarity double precision,
  negative_similarity double precision,
  positive_signal_count integer,
  negative_signal_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
begin
  if requesting_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if cardinality(coalesce(candidate_game_ids, '{}'::uuid[])) > 500
    or cardinality(coalesce(candidate_igdb_ids, '{}'::integer[])) > 500
  then
    raise exception 'At most 500 semantic candidates may be scored at once.';
  end if;

  return query
  with latest_feedback as (
    select distinct on (feedback.game_id)
      feedback.game_id,
      feedback.action
    from public.stageselect_recommendation_feedback feedback
    where feedback.user_id = requesting_user_id
    order by feedback.game_id, feedback.created_at desc, feedback.id desc
  ),
  seed_games as (
    select user_game.game_id
    from public.stageselect_user_games user_game
    where user_game.user_id = requesting_user_id

    union

    select feedback.game_id
    from latest_feedback feedback
    where feedback.action in ('more_like_this', 'not_for_me')
  ),
  raw_seed_weights as (
    select
      seed.game_id,
      (
        case
          when review.rating is not null then (review.rating::double precision - 3) * 0.75
          when user_game.status = 'finished' then 0.5
          when user_game.status = 'left' then -0.5
          when user_game.status = 'playing' then 0.35
          else 0
        end
        + case
          when feedback.action = 'more_like_this' then 2
          when feedback.action = 'not_for_me' then -2
          else 0
        end
      )::double precision as weight
    from seed_games seed
    left join public.stageselect_user_games user_game
      on user_game.user_id = requesting_user_id
      and user_game.game_id = seed.game_id
    left join public.stageselect_reviews review
      on review.user_id = requesting_user_id
      and review.game_id = seed.game_id
    left join latest_feedback feedback
      on feedback.game_id = seed.game_id
  ),
  seed_embeddings as (
    select
      weights.game_id,
      weights.weight,
      embedding.embedding
    from raw_seed_weights weights
    join public.stageselect_game_embeddings embedding
      on embedding.game_id = weights.game_id
    where weights.weight <> 0
      and embedding.status = 'ready'
      and embedding.model = 'gte-small'
      and embedding.model_version = 'supabase-gte-small-mean-normalized-v1'
      and embedding.document_version = 'game-metadata-v1'
      and embedding.embedding is not null
  ),
  candidate_embeddings as (
    select
      game.id as game_id,
      game.igdb_id,
      embedding.embedding
    from public.stageselect_games game
    join public.stageselect_game_embeddings embedding
      on embedding.game_id = game.id
    where (
        game.id = any(coalesce(candidate_game_ids, '{}'::uuid[]))
        or game.igdb_id = any(coalesce(candidate_igdb_ids, '{}'::integer[]))
      )
      and embedding.status = 'ready'
      and embedding.model = 'gte-small'
      and embedding.model_version = 'supabase-gte-small-mean-normalized-v1'
      and embedding.document_version = 'game-metadata-v1'
      and embedding.embedding is not null
  ),
  similarities as (
    select
      candidate.game_id,
      candidate.igdb_id,
      seed.weight,
      1 - (
        candidate.embedding OPERATOR(extensions.<=>) seed.embedding
      ) as similarity
    from candidate_embeddings candidate
    cross join seed_embeddings seed
    where candidate.game_id <> seed.game_id
  )
  select
    similarity.game_id,
    similarity.igdb_id,
    (
      sum(similarity.weight * similarity.similarity)
        filter (where similarity.weight > 0)
      / nullif(
          sum(similarity.weight) filter (where similarity.weight > 0),
          0
        )
    )::double precision as positive_similarity,
    (
      sum(abs(similarity.weight) * similarity.similarity)
        filter (where similarity.weight < 0)
      / nullif(
          sum(abs(similarity.weight)) filter (where similarity.weight < 0),
          0
        )
    )::double precision as negative_similarity,
    count(*) filter (where similarity.weight > 0)::integer
      as positive_signal_count,
    count(*) filter (where similarity.weight < 0)::integer
      as negative_signal_count
  from similarities similarity
  group by similarity.game_id, similarity.igdb_id;
end;
$$;

revoke all on function public.get_stageselect_semantic_scores(uuid[], integer[])
from public;
revoke all on function public.get_stageselect_semantic_scores(uuid[], integer[])
from anon;
grant execute on function public.get_stageselect_semantic_scores(uuid[], integer[])
to authenticated;

comment on function public.get_stageselect_semantic_scores(uuid[], integer[]) is
'Returns bounded, user-specific cosine similarity summaries without exposing stored game vectors.';

commit;
