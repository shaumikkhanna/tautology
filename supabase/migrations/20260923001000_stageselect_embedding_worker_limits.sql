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

update public.stageselect_game_embeddings
set
  status = 'pending',
  attempt_count = 0,
  error = null,
  requested_at = now(),
  embedded_at = null
where status = 'processing';

comment on function public.invoke_stageselect_embedding_worker() is
'Invokes the private StageSelect embedding worker for one game per request using Vault-backed credentials and a 120-second network allowance.';

commit;
