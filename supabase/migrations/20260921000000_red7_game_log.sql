begin;

alter table public.red7_rooms
add column if not exists last_turn jsonb;

create table if not exists public.red7_turn_events (
  id uuid primary key,
  room_id uuid not null references public.red7_rooms(id) on delete cascade,
  round_number integer not null,
  event jsonb not null check (jsonb_typeof(event) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists red7_turn_events_round_idx
on public.red7_turn_events (room_id, round_number, created_at);

alter table public.red7_turn_events enable row level security;
revoke all on table public.red7_turn_events from public, anon, authenticated;

drop function if exists public.red7_play_turn(text, bigint, jsonb, jsonb);

create function public.red7_play_turn(
  room_code text,
  expected_revision bigint,
  palette_plays jsonb default '[]'::jsonb,
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
  target_row public.red7_players%rowtype;
  hand_cards jsonb;
  next_palette jsonb;
  next_rule text;
  drawn_card jsonb;
  played_card jsonb;
  effect jsonb;
  effect_card jsonb;
  last_canvas_card jsonb := null;
  play_index integer;
  play_count integer;
  eligible_target_exists boolean;
  turn_steps jsonb := '[]'::jsonb;
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

  if palette_plays is null or jsonb_typeof(palette_plays) is distinct from 'array' then
    raise exception 'Invalid Palette play sequence.';
  end if;

  play_count := jsonb_array_length(palette_plays);
  if play_count = 0 and canvas_card is null then
    raise exception 'Play at least one card, or give up.';
  end if;

  if play_count > 7 then
    raise exception 'Too many Palette plays.';
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

  perform 1
  from public.red7_players
  where room_id = room_row.id
  for update;

  select cards into hand_cards
  from public.red7_hands
  where player_id = player_row.id
  for update;

  next_palette := player_row.palette;
  next_rule := room_row.canvas_color;

  if play_count > 0 then
    for play_index in 0..play_count - 1 loop
      played_card := palette_plays -> play_index -> 'card';
      effect := palette_plays -> play_index -> 'effect';

      if not public.red7_valid_card(played_card) then
        raise exception 'Invalid Palette card.';
      end if;

      if play_index > 0 and not (
        room_row.advanced_five
        and (palette_plays -> (play_index - 1) -> 'card' ->> 'value')::integer = 5
      ) then
        raise exception 'Only a 5 may add another Palette play.';
      end if;

      hand_cards := public.red7_remove_card(hand_cards, played_card);
      next_palette := next_palette || jsonb_build_array(played_card);
      turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
        'type', 'palette',
        'card', played_card,
        'source', case when play_index = 0 then 'hand' else 'five' end
      ));

      if room_row.advanced_seven and (played_card ->> 'value')::integer = 7 then
        if effect ->> 'type' is distinct from 'seven'
          or effect ->> 'destination' is null
          or effect ->> 'destination' not in ('canvas', 'deck') then
          raise exception 'Choose where to place a card from your Palette for the 7.';
        end if;

        effect_card := effect -> 'card';
        if not public.red7_valid_card(effect_card)
          or not next_palette @> jsonb_build_array(effect_card) then
          raise exception 'Choose a valid card from your Palette for the 7.';
        end if;

        next_palette := public.red7_remove_card(next_palette, effect_card);
        if effect ->> 'destination' = 'canvas' then
          next_rule := effect_card ->> 'color';
          last_canvas_card := effect_card;
          turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
            'type', 'canvas',
            'card', effect_card,
            'source', 'seven'
          ));
        else
          round_row.deck := jsonb_build_array(effect_card) || round_row.deck;
          turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
            'type', 'deck',
            'card', effect_card,
            'source', 'seven',
            'fromPlayerId', player_row.id
          ));
        end if;
      elsif room_row.advanced_five and (played_card ->> 'value')::integer = 5 then
        if jsonb_array_length(hand_cards) > 0 and play_index = play_count - 1 then
          raise exception 'The 5 requires another card from your hand to your Palette.';
        end if;
      elsif room_row.advanced_three and (played_card ->> 'value')::integer = 3 then
        if jsonb_array_length(round_row.deck) > 0 then
          drawn_card := round_row.deck -> 0;
          round_row.deck := round_row.deck - 0;
          hand_cards := hand_cards || jsonb_build_array(drawn_card);
          turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
            'type', 'draw',
            'source', 'three'
          ));
        end if;
      elsif room_row.advanced_one and (played_card ->> 'value')::integer = 1 then
        select exists (
          select 1
          from public.red7_players
          where room_id = room_row.id
            and id <> player_row.id
            and active
            and role = 'seated'
            and not eliminated
            and jsonb_array_length(palette) >= jsonb_array_length(next_palette)
            and jsonb_array_length(palette) > 0
        ) into eligible_target_exists;

        if eligible_target_exists then
          if effect ->> 'type' is distinct from 'one'
            or coalesce(not public.red7_valid_card(effect -> 'card'), true) then
            raise exception 'Choose an eligible opponent Palette card for the 1.';
          end if;

          select * into target_row
          from public.red7_players
          where id = (effect ->> 'playerId')::uuid
            and room_id = room_row.id
            and id <> player_row.id
            and active
            and role = 'seated'
            and not eliminated
            and jsonb_array_length(palette) >= jsonb_array_length(next_palette)
            and palette @> jsonb_build_array(effect -> 'card');

          if target_row.id is null then
            raise exception 'Choose an eligible opponent Palette card for the 1.';
          end if;

          effect_card := effect -> 'card';
          update public.red7_players
          set palette = public.red7_remove_card(palette, effect_card)
          where id = target_row.id;
          round_row.deck := jsonb_build_array(effect_card) || round_row.deck;
          turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
            'type', 'deck',
            'card', effect_card,
            'source', 'one',
            'fromPlayerId', target_row.id
          ));
        end if;
      end if;
    end loop;
  end if;

  if canvas_card is not null then
    hand_cards := public.red7_remove_card(hand_cards, canvas_card);
    next_rule := canvas_card ->> 'color';
    last_canvas_card := canvas_card;
    turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
      'type', 'canvas',
      'card', canvas_card,
      'source', 'hand'
    ));
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
    and last_canvas_card is not null
    and (last_canvas_card ->> 'value')::integer > jsonb_array_length(next_palette)
    and jsonb_array_length(round_row.deck) > 0 then
    drawn_card := round_row.deck -> 0;
    round_row.deck := round_row.deck - 0;
    hand_cards := hand_cards || jsonb_build_array(drawn_card);
    turn_steps := turn_steps || jsonb_build_array(jsonb_build_object(
      'type', 'draw',
      'source', 'optional'
    ));
  end if;

  update public.red7_rooms
  set last_turn = jsonb_build_object(
    'id', gen_random_uuid(),
    'actorPlayerId', player_row.id,
    'steps', turn_steps
  )
  where id = room_row.id;

  update public.red7_rounds
  set deck = round_row.deck
  where room_id = room_row.id;

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

create or replace function public.red7_record_turn_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_round integer;
  actor_name text;
  player_names jsonb;
begin
  if new.last_turn is null
    or new.last_turn is not distinct from old.last_turn then
    return new;
  end if;

  select round_number into current_round
  from public.red7_rounds
  where room_id = new.id;

  select display_name into actor_name
  from public.red7_players
  where id = (new.last_turn ->> 'actorPlayerId')::uuid;

  select coalesce(jsonb_object_agg(id::text, display_name), '{}'::jsonb)
  into player_names
  from public.red7_players
  where room_id = new.id;

  insert into public.red7_turn_events (
    id,
    room_id,
    round_number,
    event
  ) values (
    (new.last_turn ->> 'id')::uuid,
    new.id,
    coalesce(current_round, 0),
    new.last_turn || jsonb_build_object(
      'actorName', coalesce(actor_name, 'Player'),
      'playerNames', player_names
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists red7_rooms_record_turn_event on public.red7_rooms;

create trigger red7_rooms_record_turn_event
after update of last_turn on public.red7_rooms
for each row execute function public.red7_record_turn_event();

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
  game_log jsonb;
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

  select coalesce(jsonb_agg(event order by created_at), '[]'::jsonb)
  into game_log
  from public.red7_turn_events
  where room_id = room_row.id
    and round_number = coalesce(round_row.round_number, 0);

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'code', room_row.code,
      'hostUserId', room_row.host_user_id,
      'status', room_row.status,
      'drawRule', room_row.draw_rule,
      'advancedSeven', room_row.advanced_seven,
      'advancedFive', room_row.advanced_five,
      'advancedThree', room_row.advanced_three,
      'advancedOne', room_row.advanced_one,
      'lastTurn', room_row.last_turn,
      'canvasColor', room_row.canvas_color,
      'revision', room_row.revision,
      'winnerPlayerId', room_row.winner_player_id,
      'expiresAt', room_row.expires_at
    ),
    'players', player_list,
    'privateState', jsonb_build_object(
      'playerId', player_row.id,
      'cards', coalesce(own_hand, '[]'::jsonb)
    ),
    'round', jsonb_build_object(
      'currentPlayerId', round_row.current_player_id,
      'turnOrder', coalesce(to_jsonb(round_row.turn_order), '[]'::jsonb),
      'roundNumber', coalesce(round_row.round_number, 0),
      'deckCount', coalesce(jsonb_array_length(round_row.deck), 0)
    ),
    'gameLog', game_log
  );
end;
$$;

revoke execute on function public.red7_get_state(text)
from public, anon;

grant execute on function public.red7_get_state(text)
to authenticated;

commit;
