-- Rebrand: rename foodiemon_characters -> foodling_characters (FoodieMon -> Foodlings).
-- Table rename is metadata-only — indexes, constraints, and RLS policies
-- follow automatically via OID and need no changes. The two RPC functions
-- below reference the table by name in their PL/pgSQL body text, so they
-- must be re-declared in the same transaction or they'd start failing with
-- "relation does not exist" the instant the rename lands.

alter table public.foodiemon_characters rename to foodling_characters;

create or replace function public.process_checkin(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_staff_id uuid,
  p_amount numeric
)
returns table (
  checkin_id uuid,
  xp_awarded int,
  points_awarded int,
  rate_limited boolean,
  new_stage smallint,
  evolved boolean,
  new_cumulative_xp int
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_last_checkin timestamptz;
  v_is_limited boolean := false;
  v_xp int := 0;
  v_points int := 0;
  v_progress record;
  v_character record;
  v_old_stage smallint;
  v_new_stage smallint;
  v_checkin_id uuid;
begin
  -- staff must belong to the restaurant they're checking someone into
  if p_staff_id <> auth.uid() then
    raise exception 'p_staff_id must match the authenticated caller';
  end if;

  if not exists (
    select 1 from staff s
    where s.id = p_staff_id and s.restaurant_id = p_restaurant_id and s.active
  ) then
    raise exception 'staff member % is not authorized for restaurant %', p_staff_id, p_restaurant_id;
  end if;

  -- 4-hour rate limit: check the most recent NON-rate-limited checkin
  select created_at into v_last_checkin
  from checkins
  where user_id = p_user_id
    and restaurant_id = p_restaurant_id
    and rate_limited = false
  order by created_at desc
  limit 1;

  if v_last_checkin is not null and v_last_checkin > now() - interval '4 hours' then
    v_is_limited := true;
  end if;

  if not v_is_limited then
    v_xp := floor(p_amount)::int;      -- 1 xp = $1
    v_points := floor(p_amount)::int;  -- 1 point = $1, separate currency
  end if;

  -- ensure a progress row exists
  insert into user_restaurant_progress (user_id, restaurant_id)
  values (p_user_id, p_restaurant_id)
  on conflict (user_id, restaurant_id) do nothing;

  select * into v_progress
  from user_restaurant_progress
  where user_id = p_user_id and restaurant_id = p_restaurant_id
  for update;

  select * into v_character
  from foodling_characters
  where restaurant_id = p_restaurant_id;

  v_old_stage := v_progress.current_stage;

  update user_restaurant_progress
  set cumulative_spend = cumulative_spend + p_amount,
      current_xp = current_xp + v_xp,
      visit_count = visit_count + 1,
      current_stage = case
        when current_xp + v_xp >= v_character.xp_threshold_stage3 then 3
        when current_xp + v_xp >= v_character.xp_threshold_stage2 then 2
        else current_stage
      end
  where user_id = p_user_id and restaurant_id = p_restaurant_id
  returning current_stage, current_xp into v_new_stage, v_progress.current_xp;

  insert into checkins (user_id, restaurant_id, staff_id, amount, xp_awarded, points_awarded, rate_limited)
  values (p_user_id, p_restaurant_id, p_staff_id, p_amount, v_xp, v_points, v_is_limited)
  returning id into v_checkin_id;

  return query select
    v_checkin_id,
    v_xp,
    v_points,
    v_is_limited,
    v_new_stage,
    (v_new_stage > v_old_stage),
    v_progress.current_xp;
end;
$$;

create or replace function public.update_xp_thresholds(
  p_xp_threshold_stage2 int,
  p_xp_threshold_stage3 int
)
returns public.foodling_characters
language plpgsql
security definer set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_character public.foodling_characters;
begin
  select restaurant_id into v_restaurant_id
  from staff
  where id = auth.uid() and active;

  if v_restaurant_id is null then
    raise exception 'no active staff record found for the authenticated user';
  end if;

  update foodling_characters
  set xp_threshold_stage2 = p_xp_threshold_stage2,
      xp_threshold_stage3 = p_xp_threshold_stage3
  where restaurant_id = v_restaurant_id
  returning * into v_character;

  if v_character is null then
    raise exception 'no foodling character found for restaurant %', v_restaurant_id;
  end if;

  return v_character;
end;
$$;
