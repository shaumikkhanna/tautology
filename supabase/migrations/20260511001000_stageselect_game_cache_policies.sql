drop policy if exists "Authenticated users can cache IGDB games"
on public.stageselect_games;

create policy "Authenticated users can cache IGDB games"
on public.stageselect_games for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can refresh cached IGDB games"
on public.stageselect_games;

create policy "Authenticated users can refresh cached IGDB games"
on public.stageselect_games for update
to authenticated
using (true)
with check (true);
