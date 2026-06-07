create or replace function public.red7_advance_turn(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  round_row public.red7_rounds%rowtype;
  current_index integer;
  candidate_id uuid;
  active_count integer;
  winner_id uuid;
  offset_index integer;
begin
  select * into round_row
  from public.red7_rounds
  where room_id = target_room_id
  for update;

  select count(*)
  into active_count
  from public.red7_players
  where room_id = target_room_id
    and active
    and role = 'seated'
    and not eliminated;

  if active_count <= 1 then
    select id
    into winner_id
    from public.red7_players
    where room_id = target_room_id
      and active
      and role = 'seated'
      and not eliminated
    limit 1;

    update public.red7_rooms
    set status = 'finished',
      winner_player_id = winner_id
    where id = target_room_id;

    update public.red7_rounds
    set current_player_id = null
    where room_id = target_room_id;
    return;
  end if;

  current_index := array_position(round_row.turn_order, round_row.current_player_id);
  if current_index is null then
    current_index := 0;
  end if;

  for offset_index in 1..array_length(round_row.turn_order, 1) loop
    candidate_id := round_row.turn_order[
      ((current_index - 1 + offset_index) % array_length(round_row.turn_order, 1)) + 1
    ];

    if exists (
      select 1
      from public.red7_players
      where id = candidate_id
        and active
        and role = 'seated'
        and not eliminated
    ) then
      update public.red7_rounds
      set current_player_id = candidate_id
      where room_id = target_room_id;
      return;
    end if;
  end loop;
end;
$$;

revoke execute on function public.red7_advance_turn(uuid)
from public, anon, authenticated;
