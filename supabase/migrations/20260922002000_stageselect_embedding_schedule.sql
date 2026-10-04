begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

create or replace function public.configure_stageselect_embedding_schedule(
  project_url text,
  worker_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url_secret_id uuid;
  worker_secret_id uuid;
begin
  if project_url !~ '^https://[a-z0-9-]+\.supabase\.co/?$' then
    raise exception 'A valid Supabase project URL is required.';
  end if;

  if worker_secret !~ '^sb_secret_' then
    raise exception 'A current Supabase secret key is required.';
  end if;

  select id
  into project_url_secret_id
  from vault.secrets
  where name = 'stageselect_project_url'
  order by created_at desc
  limit 1;

  if project_url_secret_id is null then
    perform vault.create_secret(
      rtrim(project_url, '/'),
      'stageselect_project_url',
      'StageSelect embedding worker project URL'
    );
  else
    perform vault.update_secret(
      project_url_secret_id,
      rtrim(project_url, '/'),
      'stageselect_project_url',
      'StageSelect embedding worker project URL'
    );
  end if;

  select id
  into worker_secret_id
  from vault.secrets
  where name = 'stageselect_worker_secret'
  order by created_at desc
  limit 1;

  if worker_secret_id is null then
    perform vault.create_secret(
      worker_secret,
      'stageselect_worker_secret',
      'Secret key used only by the StageSelect embedding schedule'
    );
  else
    perform vault.update_secret(
      worker_secret_id,
      worker_secret,
      'stageselect_worker_secret',
      'Secret key used only by the StageSelect embedding schedule'
    );
  end if;
end;
$$;

revoke all on function public.configure_stageselect_embedding_schedule(text, text)
from public;
revoke all on function public.configure_stageselect_embedding_schedule(text, text)
from anon;
revoke all on function public.configure_stageselect_embedding_schedule(text, text)
from authenticated;
grant execute on function public.configure_stageselect_embedding_schedule(text, text)
to service_role;

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
    body := jsonb_build_object('batchSize', 10),
    timeout_milliseconds := 30000
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
    '* * * * *',
    'select public.invoke_stageselect_embedding_worker();'
  );
end;
$$;

comment on function public.invoke_stageselect_embedding_worker() is
'Invokes the private StageSelect embedding worker using project URL and secret-key values stored in Supabase Vault.';

commit;
