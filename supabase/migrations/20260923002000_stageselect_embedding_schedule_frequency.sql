begin;

create or replace function public.invoke_stageselect_embedding_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  worker_secret text;
begin
  if not exists (
    select 1
    from public.stageselect_game_embeddings embedding
    where embedding.attempt_count < 5
      and (
        embedding.status in ('pending', 'failed')
        or (
          embedding.status = 'processing'
          and embedding.updated_at < now() - interval '10 minutes'
        )
      )
  ) then
    return null;
  end if;

  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'stageselect_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into worker_secret
  from vault.decrypted_secrets
  where name = 'stageselect_worker_secret'
  order by created_at desc
  limit 1;

  if project_url is null or worker_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/stageselect-embed-games',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', worker_secret
    ),
    body := jsonb_build_object('batchSize', 1),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.invoke_stageselect_embedding_worker()
from public;
revoke all on function public.invoke_stageselect_embedding_worker()
from anon;
revoke all on function public.invoke_stageselect_embedding_worker()
from authenticated;
grant execute on function public.invoke_stageselect_embedding_worker()
to service_role;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'stageselect-embedding-worker'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'stageselect-embedding-worker',
    '*/5 * * * *',
    'select public.invoke_stageselect_embedding_worker();'
  );
end;
$$;

comment on function public.invoke_stageselect_embedding_worker() is
'Invokes the one-game StageSelect embedding worker only when claimable work exists; scheduled every five minutes.';

commit;
