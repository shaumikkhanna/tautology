create or replace function public.red7_set_draw_rule(
  room_code text,
  enabled boolean
)
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
    raise exception 'Only the host can change room settings.';
  end if;

  if room_row.status <> 'lobby' then
    raise exception 'Room settings can only be changed in the lobby.';
  end if;

  if room_row.draw_rule is distinct from enabled then
    update public.red7_rooms
    set draw_rule = enabled
    where id = room_row.id;

    perform public.red7_touch_room(room_row.id);
  end if;

  return public.red7_get_state(room_row.code);
end;
$$;

revoke execute on function public.red7_set_draw_rule(text, boolean)
from public, anon;

grant execute on function public.red7_set_draw_rule(text, boolean)
to authenticated;
