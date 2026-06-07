create type public.red7_room_status as enum ('lobby', 'playing', 'finished');
create type public.red7_player_role as enum ('seated', 'spectator');

create table public.red7_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{20}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status public.red7_room_status not null default 'lobby',
  draw_rule boolean not null default false,
  canvas_color text not null default 'red'
    check (canvas_color in ('red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet')),
  revision bigint not null default 0,
  winner_player_id uuid,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.red7_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.red7_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  role public.red7_player_role not null default 'spectator',
  seat integer check (seat between 1 and 5),
  active boolean not null default true,
  eliminated boolean not null default false,
  palette jsonb not null default '[]'::jsonb check (jsonb_typeof(palette) = 'array'),
  last_seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

alter table public.red7_rooms
add constraint red7_rooms_winner_player_fkey
foreign key (winner_player_id) references public.red7_players(id) on delete set null;

create table public.red7_hands (
  player_id uuid primary key references public.red7_players(id) on delete cascade,
  room_id uuid not null references public.red7_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  updated_at timestamptz not null default now()
);

create table public.red7_rounds (
  room_id uuid primary key references public.red7_rooms(id) on delete cascade,
  deck jsonb not null default '[]'::jsonb check (jsonb_typeof(deck) = 'array'),
  turn_order uuid[] not null default '{}',
  current_player_id uuid references public.red7_players(id) on delete set null,
  round_number integer not null default 0 check (round_number >= 0),
  updated_at timestamptz not null default now()
);

create index red7_players_room_active_idx
on public.red7_players (room_id, active, role, seat);

create index red7_players_room_seen_idx
on public.red7_players (room_id, last_seen_at);

create index red7_rooms_expiry_idx
on public.red7_rooms (expires_at);

create trigger red7_rooms_set_updated_at
before update on public.red7_rooms
for each row execute function public.set_updated_at();

create trigger red7_players_set_updated_at
before update on public.red7_players
for each row execute function public.set_updated_at();

create trigger red7_hands_set_updated_at
before update on public.red7_hands
for each row execute function public.set_updated_at();

create trigger red7_rounds_set_updated_at
before update on public.red7_rounds
for each row execute function public.set_updated_at();

alter table public.red7_rooms enable row level security;
alter table public.red7_players enable row level security;
alter table public.red7_hands enable row level security;
alter table public.red7_rounds enable row level security;

do $$
begin
  alter publication supabase_realtime
  add table public.red7_rooms, public.red7_players, public.red7_hands;
exception
  when duplicate_object or undefined_object then
    null;
end;
$$;

create or replace function public.red7_is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.red7_players
    where room_id = target_room_id
      and user_id = auth.uid()
      and active
  );
$$;

create policy "Red7 members can read their room"
on public.red7_rooms for select
to authenticated
using (public.red7_is_room_member(id));

create policy "Red7 members can read the room roster"
on public.red7_players for select
to authenticated
using (public.red7_is_room_member(room_id));

create policy "Red7 players can read their own hand"
on public.red7_hands for select
to authenticated
using (user_id = auth.uid());

revoke all on public.red7_rooms from anon, authenticated;
revoke all on public.red7_players from anon, authenticated;
revoke all on public.red7_hands from anon, authenticated;
revoke all on public.red7_rounds from anon, authenticated;

grant select on public.red7_rooms to authenticated;
grant select on public.red7_players to authenticated;
grant select on public.red7_hands to authenticated;

create or replace function public.red7_color_rank(color_name text)
returns integer
language sql
immutable
as $$
  select case color_name
    when 'red' then 7
    when 'orange' then 6
    when 'yellow' then 5
    when 'green' then 4
    when 'blue' then 3
    when 'indigo' then 2
    when 'violet' then 1
    else 0
  end;
$$;

create or replace function public.red7_card_strength(card jsonb)
returns integer
language sql
immutable
as $$
  select coalesce((card ->> 'value')::integer, 0) * 10
    + public.red7_color_rank(card ->> 'color');
$$;

create or replace function public.red7_valid_card(card jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(card) = 'object'
    and card ->> 'color' in ('red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet')
    and (card ->> 'value') ~ '^[1-7]$';
$$;

create or replace function public.red7_remove_card(cards jsonb, target jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  card_index integer;
begin
  select ordinality - 1
  into card_index
  from jsonb_array_elements(cards) with ordinality item(card, ordinality)
  where card = target
  limit 1;

  if card_index is null then
    raise exception 'That card is not in your hand.';
  end if;

  return cards - card_index;
end;
$$;

create or replace function public.red7_rule_score(palette jsonb, rule_name text)
returns integer[]
language plpgsql
immutable
as $$
declare
  result integer[];
  start_value integer;
  end_value integer;
  run_length integer;
  run_high integer;
begin
  if jsonb_array_length(palette) = 0 then
    return array[0, 0];
  end if;

  if rule_name = 'red' then
    select array[1, max(public.red7_card_strength(card))]
    into result
    from jsonb_array_elements(palette) item(card);
    return result;
  end if;

  if rule_name = 'orange' then
    select array[count(*)::integer, max(public.red7_card_strength(card))]
    into result
    from jsonb_array_elements(palette) item(card)
    group by (card ->> 'value')::integer
    order by count(*) desc, max(public.red7_card_strength(card)) desc
    limit 1;
    return result;
  end if;

  if rule_name = 'yellow' then
    select array[count(*)::integer, max(public.red7_card_strength(card))]
    into result
    from jsonb_array_elements(palette) item(card)
    group by card ->> 'color'
    order by count(*) desc, max(public.red7_card_strength(card)) desc
    limit 1;
    return result;
  end if;

  if rule_name = 'green' then
    select array[count(*)::integer, coalesce(max(public.red7_card_strength(card)), 0)]
    into result
    from jsonb_array_elements(palette) item(card)
    where (card ->> 'value')::integer % 2 = 0;
    return result;
  end if;

  if rule_name = 'blue' then
    with strongest_by_color as (
      select card ->> 'color' as color_name,
        max(public.red7_card_strength(card)) as strongest
      from jsonb_array_elements(palette) item(card)
      group by card ->> 'color'
    )
    select array[count(*)::integer, coalesce(max(strongest), 0)]
    into result
    from strongest_by_color;
    return result;
  end if;

  if rule_name = 'indigo' then
    result := array[0, 0];
    for start_value in 1..7 loop
      for end_value in start_value..7 loop
        select count(distinct (card ->> 'value')::integer),
          coalesce(max(public.red7_card_strength(card)), 0)
        into run_length, run_high
        from jsonb_array_elements(palette) item(card)
        where (card ->> 'value')::integer between start_value and end_value;

        if run_length = end_value - start_value + 1
          and array[run_length, run_high] > result then
          result := array[run_length, run_high];
        end if;
      end loop;
    end loop;
    return result;
  end if;

  if rule_name = 'violet' then
    select array[count(*)::integer, coalesce(max(public.red7_card_strength(card)), 0)]
    into result
    from jsonb_array_elements(palette) item(card)
    where (card ->> 'value')::integer < 4;
    return result;
  end if;

  raise exception 'Unknown Red7 rule.';
end;
$$;

create or replace function public.red7_player_is_winning(
  target_room_id uuid,
  target_player_id uuid,
  rule_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_score integer[];
begin
  select public.red7_rule_score(palette, rule_name)
  into target_score
  from public.red7_players
  where id = target_player_id
    and room_id = target_room_id
    and active
    and role = 'seated'
    and not eliminated;

  if target_score is null then
    return false;
  end if;

  return not exists (
    select 1
    from public.red7_players
    where room_id = target_room_id
      and id <> target_player_id
      and active
      and role = 'seated'
      and not eliminated
      and public.red7_rule_score(palette, rule_name) >= target_score
  );
end;
$$;

create or replace function public.red7_touch_room(target_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.red7_rooms
  set revision = revision + 1,
    last_activity_at = now(),
    expires_at = now() + interval '24 hours'
  where id = target_room_id;
$$;

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

create or replace function public.red7_create_room(
  display_name text,
  enable_draw_rule boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(display_name);
  new_room public.red7_rooms%rowtype;
  new_player public.red7_players%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 30 then
    raise exception 'Enter a name between 1 and 30 characters.';
  end if;

  insert into public.red7_rooms (code, host_user_id, draw_rule)
  values (
    lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    auth.uid(),
    enable_draw_rule
  )
  returning * into new_room;

  insert into public.red7_players (
    room_id, user_id, display_name, role, seat
  )
  values (
    new_room.id, auth.uid(), clean_name, 'seated', 1
  )
  returning * into new_player;

  insert into public.red7_hands (player_id, room_id, user_id)
  values (new_player.id, new_room.id, auth.uid());

  insert into public.red7_rounds (room_id)
  values (new_room.id);

  return public.red7_get_state(new_room.code);
end;
$$;

create or replace function public.red7_join_room(
  room_code text,
  display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := trim(display_name);
  room_row public.red7_rooms%rowtype;
  player_row public.red7_players%rowtype;
  next_seat integer;
  chosen_role public.red7_player_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(clean_name) < 1 or char_length(clean_name) > 30 then
    raise exception 'Enter a name between 1 and 30 characters.';
  end if;

  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null then
    raise exception 'Room not found.';
  end if;

  if room_row.expires_at <= now() then
    raise exception 'This room has expired.';
  end if;

  select * into player_row
  from public.red7_players
  where room_id = room_row.id
    and user_id = auth.uid();

  if player_row.id is not null then
    update public.red7_players
    set display_name = clean_name,
      active = true,
      last_seen_at = now(),
      role = case when active then role else 'spectator'::public.red7_player_role end,
      seat = case when active then seat else null end
    where id = player_row.id;

    insert into public.red7_hands (player_id, room_id, user_id)
    values (player_row.id, room_row.id, auth.uid())
    on conflict (player_id) do nothing;

    perform public.red7_touch_room(room_row.id);
    return public.red7_get_state(room_row.code);
  end if;

  next_seat := null;
  if room_row.status = 'lobby' then
    select seat_number
    into next_seat
    from generate_series(1, 5) seat_number
    where not exists (
      select 1
      from public.red7_players
      where room_id = room_row.id
        and active
        and seat = seat_number
    )
    order by seat_number
    limit 1;
  end if;

  chosen_role := case
    when next_seat is null then 'spectator'::public.red7_player_role
    else 'seated'::public.red7_player_role
  end;

  insert into public.red7_players (
    room_id, user_id, display_name, role, seat
  )
  values (
    room_row.id, auth.uid(), clean_name, chosen_role, next_seat
  )
  returning * into player_row;

  insert into public.red7_hands (player_id, room_id, user_id)
  values (player_row.id, room_row.id, auth.uid());

  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

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
  next_seat integer := 1;
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
      seat = next_seat
    where id = player_row.id;
    next_seat := next_seat + 1;
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

  delete from public.red7_hands where room_id = room_row.id;

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

create or replace function public.red7_pass_turn(
  room_code text,
  expected_revision bigint
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
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.status <> 'playing' then
    raise exception 'The round is not in progress.';
  end if;

  if room_row.revision <> expected_revision then
    raise exception 'The game changed. Please try again.';
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

  update public.red7_players
  set eliminated = true
  where id = player_row.id;

  perform public.red7_advance_turn(room_row.id);
  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

create or replace function public.red7_kick_player(
  room_code text,
  target_player_id uuid,
  expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
  target_player public.red7_players%rowtype;
  round_row public.red7_rounds%rowtype;
  active_count integer;
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.host_user_id <> auth.uid() then
    raise exception 'Only the host can remove players.';
  end if;

  if room_row.revision <> expected_revision then
    raise exception 'The room changed. Please try again.';
  end if;

  select * into target_player
  from public.red7_players
  where id = target_player_id
    and room_id = room_row.id
  for update;

  if target_player.id is null or target_player.user_id = auth.uid() then
    raise exception 'That player cannot be removed.';
  end if;

  update public.red7_players
  set active = false,
    role = 'spectator',
    seat = null,
    eliminated = true,
    palette = '[]'::jsonb
  where id = target_player.id;

  select * into round_row
  from public.red7_rounds
  where room_id = room_row.id;

  select count(*) into active_count
  from public.red7_players
  where room_id = room_row.id
    and active
    and role = 'seated'
    and not eliminated;

  if room_row.status = 'playing'
    and (round_row.current_player_id = target_player.id or active_count <= 1) then
    perform public.red7_advance_turn(room_row.id);
  end if;

  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

create or replace function public.red7_return_to_lobby(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.host_user_id <> auth.uid() then
    raise exception 'Only the host can reset the room.';
  end if;

  if room_row.status <> 'finished' then
    raise exception 'The current round is not finished.';
  end if;

  update public.red7_rooms
  set status = 'lobby',
    canvas_color = 'red',
    winner_player_id = null
  where id = room_row.id;

  update public.red7_players
  set eliminated = false,
    palette = '[]'::jsonb
  where room_id = room_row.id;

  update public.red7_hands
  set cards = '[]'::jsonb
  where room_id = room_row.id;

  update public.red7_rounds
  set deck = '[]'::jsonb,
    turn_order = '{}',
    current_player_id = null
  where room_id = room_row.id;

  perform public.red7_touch_room(room_row.id);
  return public.red7_get_state(room_row.code);
end;
$$;

create or replace function public.red7_heartbeat(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.red7_rooms%rowtype;
  player_row public.red7_players%rowtype;
  next_host uuid;
begin
  select * into room_row
  from public.red7_rooms
  where code = lower(trim(room_code))
  for update;

  if room_row.id is null or room_row.expires_at <= now() then
    raise exception 'Room not found or expired.';
  end if;

  update public.red7_players
  set last_seen_at = now()
  where room_id = room_row.id
    and user_id = auth.uid()
    and active
  returning * into player_row;

  if player_row.id is null then
    raise exception 'You are no longer in this room.';
  end if;

  if not exists (
    select 1
    from public.red7_players
    where room_id = room_row.id
      and user_id = room_row.host_user_id
      and active
      and last_seen_at > now() - interval '15 seconds'
  ) then
    select user_id into next_host
    from public.red7_players
    where room_id = room_row.id
      and active
      and last_seen_at > now() - interval '15 seconds'
    order by
      case when role = 'seated' then 0 else 1 end,
      joined_at
    limit 1;

    if next_host is not null and next_host <> room_row.host_user_id then
      update public.red7_rooms
      set host_user_id = next_host
      where id = room_row.id;
      perform public.red7_touch_room(room_row.id);
    else
      update public.red7_rooms
      set last_activity_at = now(),
        expires_at = now() + interval '24 hours'
      where id = room_row.id;
    end if;
  else
    update public.red7_rooms
    set last_activity_at = now(),
      expires_at = now() + interval '24 hours'
    where id = room_row.id;
  end if;

  return public.red7_get_state(room_row.code);
end;
$$;

create or replace function public.red7_cleanup_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.red7_rooms
  where expires_at <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.red7_touch_room(uuid) from public, anon, authenticated;
revoke execute on function public.red7_advance_turn(uuid) from public, anon, authenticated;
revoke execute on function public.red7_player_is_winning(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.red7_cleanup_expired_rooms() from public, anon, authenticated;
revoke execute on function public.red7_get_state(text) from public, anon;
revoke execute on function public.red7_create_room(text, boolean) from public, anon;
revoke execute on function public.red7_join_room(text, text) from public, anon;
revoke execute on function public.red7_start_round(text) from public, anon;
revoke execute on function public.red7_play_turn(text, bigint, jsonb, jsonb) from public, anon;
revoke execute on function public.red7_pass_turn(text, bigint) from public, anon;
revoke execute on function public.red7_kick_player(text, uuid, bigint) from public, anon;
revoke execute on function public.red7_return_to_lobby(text) from public, anon;
revoke execute on function public.red7_heartbeat(text) from public, anon;
grant execute on function public.red7_is_room_member(uuid) to authenticated;
grant execute on function public.red7_get_state(text) to authenticated;
grant execute on function public.red7_create_room(text, boolean) to authenticated;
grant execute on function public.red7_join_room(text, text) to authenticated;
grant execute on function public.red7_start_round(text) to authenticated;
grant execute on function public.red7_play_turn(text, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.red7_pass_turn(text, bigint) to authenticated;
grant execute on function public.red7_kick_player(text, uuid, bigint) to authenticated;
grant execute on function public.red7_return_to_lobby(text) to authenticated;
grant execute on function public.red7_heartbeat(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'red7-cleanup-expired-rooms',
      '17 * * * *',
      'select public.red7_cleanup_expired_rooms()'
    );
  end if;
exception
  when undefined_table or invalid_schema_name then
    null;
end;
$$;
