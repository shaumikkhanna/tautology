create or replace function public.red7_get_state(room_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
  player_row public.red7_players%rowtype;
  round_row public.red7_rounds%rowtype;
  player_list jsonb;
  own_hand jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code));

  if room_row.id is null then
    raise exception 'Room not found.';
  end if;

  if room_row.expires_at <= now() then
    raise exception 'This room has expired.';
  end if;

  select * into player_row
  from public.red7_players
  where room_id = room_row.id
    and user_id = auth.uid()
    and active;

  if player_row.id is null then
    raise exception 'Join the room first.';
  end if;

  select * into round_row
  from public.red7_rounds
  where room_id = room_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', red7_players.id,
        'userId', red7_players.user_id,
        'displayName', red7_players.display_name,
        'role', red7_players.role,
        'seat', red7_players.seat,
        'active', red7_players.active,
        'eliminated', red7_players.eliminated,
        'palette', red7_players.palette,
        'handCount', coalesce((
          select jsonb_array_length(red7_hands.cards)
          from public.red7_hands
          where red7_hands.player_id = red7_players.id
        ), 0),
        'lastSeenAt', red7_players.last_seen_at,
        'joinedAt', red7_players.joined_at
      )
      order by coalesce(red7_players.seat, 99), red7_players.joined_at
    ),
    '[]'::jsonb
  )
  into player_list
  from public.red7_players
  where room_id = room_row.id
    and active;

  select coalesce(cards, '[]'::jsonb)
  into own_hand
  from public.red7_hands
  where player_id = player_row.id
    and user_id = auth.uid();

  own_hand := coalesce(own_hand, '[]'::jsonb);

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'code', room_row.code,
      'hostUserId', room_row.host_user_id,
      'status', room_row.status,
      'drawRule', room_row.draw_rule,
      'canvasColor', room_row.canvas_color,
      'revision', room_row.revision,
      'winnerPlayerId', room_row.winner_player_id,
      'expiresAt', room_row.expires_at
    ),
    'players', player_list,
    'privateState', jsonb_build_object(
      'playerId', player_row.id,
      'cards', own_hand
    ),
    'round', jsonb_build_object(
      'currentPlayerId', round_row.current_player_id,
      'turnOrder', coalesce(to_jsonb(round_row.turn_order), '[]'::jsonb),
      'roundNumber', coalesce(round_row.round_number, 0),
      'deckCount', coalesce(jsonb_array_length(round_row.deck), 0)
    )
  );
end;
$$;

revoke execute on function public.red7_get_state(text)
from public, anon;

grant execute on function public.red7_get_state(text)
to authenticated;
