create or replace function public.red7_play_turn(
  room_code text,
  expected_revision bigint,
  palette_card jsonb default null,
  canvas_card jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
  player_row public.red7_players%rowtype;
  round_row public.red7_rounds%rowtype;
  hand_cards jsonb;
  next_palette jsonb;
  next_rule text;
  drawn_card jsonb;
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.expires_at <= now() then
    raise exception 'Room not found or expired.';
  end if;

  if room_row.status <> 'playing' then
    raise exception 'The round is not in progress.';
  end if;

  if room_row.revision <> expected_revision then
    raise exception 'The game changed. Please try your move again.';
  end if;

  if palette_card is null and canvas_card is null then
    raise exception 'Play at least one card, or give up.';
  end if;

  if palette_card is not null and not public.red7_valid_card(palette_card) then
    raise exception 'Invalid Palette card.';
  end if;

  if canvas_card is not null and not public.red7_valid_card(canvas_card) then
    raise exception 'Invalid Canvas card.';
  end if;

  select * into player_row
  from public.red7_players
  where room_id = room_row.id
    and user_id = auth.uid()
    and active
    and role = 'seated'
    and not eliminated
  for update;

  select * into round_row
  from public.red7_rounds
  where room_id = room_row.id
  for update;

  if player_row.id is null or round_row.current_player_id <> player_row.id then
    raise exception 'It is not your turn.';
  end if;

  select cards into hand_cards
  from public.red7_hands
  where player_id = player_row.id
  for update;

  next_palette := player_row.palette;
  if palette_card is not null then
    hand_cards := public.red7_remove_card(hand_cards, palette_card);
    next_palette := next_palette || jsonb_build_array(palette_card);
  end if;

  next_rule := room_row.canvas_color;
  if canvas_card is not null then
    hand_cards := public.red7_remove_card(hand_cards, canvas_card);
    next_rule := canvas_card ->> 'color';
  end if;

  update public.red7_players
  set palette = next_palette
  where id = player_row.id;

  update public.red7_rooms
  set canvas_color = next_rule
  where id = room_row.id;

  if not public.red7_player_is_winning(room_row.id, player_row.id, next_rule) then
    raise exception 'That move does not leave you winning.';
  end if;

  if room_row.draw_rule
    and canvas_card is not null
    and (canvas_card ->> 'value')::integer > jsonb_array_length(next_palette)
    and jsonb_array_length(round_row.deck) > 0 then
    drawn_card := round_row.deck -> 0;
    hand_cards := hand_cards || jsonb_build_array(drawn_card);

    update public.red7_rounds
    set deck = deck - 0
    where room_id = room_row.id;
  end if;

  update public.red7_hands
  set cards = hand_cards
  where player_id = player_row.id;

  perform public.red7_advance_turn(room_row.id);
  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

revoke execute on function public.red7_play_turn(text, bigint, jsonb, jsonb)
from public, anon;

grant execute on function public.red7_play_turn(text, bigint, jsonb, jsonb)
to authenticated;
