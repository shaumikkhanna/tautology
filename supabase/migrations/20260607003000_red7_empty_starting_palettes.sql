create or replace function public.red7_start_round(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
  round_row public.red7_rounds%rowtype;
  player_row record;
  shuffled_deck jsonb;
  player_hand jsonb;
  turn_ids uuid[] := '{}';
  seated_count integer;
  seat_number integer := 1;
  deal_index integer;
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.expires_at <= now() then
    raise exception 'Room not found or expired.';
  end if;

  if room_row.host_user_id <> auth.uid() then
    raise exception 'Only the host can start a round.';
  end if;

  update public.red7_players
  set role = 'spectator',
    seat = null,
    eliminated = false,
    palette = '[]'::jsonb
  where room_id = room_row.id;

  for player_row in
    select id
    from public.red7_players
    where room_id = room_row.id
      and active
      and last_seen_at > now() - interval '45 seconds'
    order by joined_at
    limit 5
  loop
    update public.red7_players
    set role = 'seated',
      seat = seat_number
    where id = player_row.id;
    seat_number := seat_number + 1;
  end loop;

  select count(*) into seated_count
  from public.red7_players
  where room_id = room_row.id
    and active
    and role = 'seated';

  if seated_count < 2 then
    raise exception 'At least two connected players are required.';
  end if;

  select jsonb_agg(
    jsonb_build_object('color', color_name, 'value', card_value)
    order by random()
  )
  into shuffled_deck
  from unnest(array['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']) color_name
  cross join generate_series(1, 7) card_value;

  delete from public.red7_hands
  where room_id = room_row.id;

  for player_row in
    select id, user_id
    from public.red7_players
    where room_id = room_row.id
      and active
      and role = 'seated'
    order by random()
  loop
    player_hand := '[]'::jsonb;

    for deal_index in 1..7 loop
      player_hand := player_hand || jsonb_build_array(shuffled_deck -> 0);
      shuffled_deck := shuffled_deck - 0;
    end loop;

    update public.red7_players
    set palette = '[]'::jsonb,
      eliminated = false
    where id = player_row.id;

    insert into public.red7_hands (player_id, room_id, user_id, cards)
    values (player_row.id, room_row.id, player_row.user_id, player_hand);

    turn_ids := array_append(turn_ids, player_row.id);
  end loop;

  insert into public.red7_hands (player_id, room_id, user_id, cards)
  select id, room_id, user_id, '[]'::jsonb
  from public.red7_players
  where room_id = room_row.id
    and active
    and role = 'spectator'
  on conflict (player_id) do update set cards = excluded.cards;

  select * into round_row
  from public.red7_rounds
  where room_id = room_row.id
  for update;

  update public.red7_rounds
  set deck = shuffled_deck,
    turn_order = turn_ids,
    current_player_id = turn_ids[1],
    round_number = round_row.round_number + 1
  where room_id = room_row.id;

  update public.red7_rooms
  set status = 'playing',
    canvas_color = 'red',
    winner_player_id = null
  where id = room_row.id;

  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

revoke execute on function public.red7_start_round(text)
from public, anon;

grant execute on function public.red7_start_round(text)
to authenticated;
