-- Evolution thresholds RPC — lets a restaurant's staff tune how much XP
-- customers need to evolve their Foodiemon at that restaurant. Restaurant
-- is inferred from the caller's staff row (never passed in by the client),
-- so a staff account can only ever edit its own restaurant's character.
-- thresholds_increase on foodiemon_characters enforces stage3 > stage2 > 0.
create or replace function public.update_xp_thresholds(
  p_xp_threshold_stage2 int,
  p_xp_threshold_stage3 int
)
returns public.foodiemon_characters
language plpgsql
security definer set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_character public.foodiemon_characters;
begin
  select restaurant_id into v_restaurant_id
  from staff
  where id = auth.uid() and active;

  if v_restaurant_id is null then
    raise exception 'no active staff record found for the authenticated user';
  end if;

  update foodiemon_characters
  set xp_threshold_stage2 = p_xp_threshold_stage2,
      xp_threshold_stage3 = p_xp_threshold_stage3
  where restaurant_id = v_restaurant_id
  returning * into v_character;

  if v_character is null then
    raise exception 'no foodiemon character found for restaurant %', v_restaurant_id;
  end if;

  return v_character;
end;
$$;

grant execute on function public.update_xp_thresholds(int, int) to authenticated;
