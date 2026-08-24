-- =========================================================
-- Foodlings — Supabase schema
-- Run in the Supabase SQL editor, or via `supabase db push`
-- with this file in supabase/migrations/
-- =========================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- 1. USERS
-- Supabase auth.users already handles login/identity.
-- This table holds the app-facing profile, 1:1 with auth.users.
-- =========================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  home_city text default 'Denver',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'New Trainer'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 2. STAFF (separate from `users` — staff portal logins,
-- not app customers. Not in the original brief's data model
-- explicitly, but checkins.staff_id needs somewhere to point.)
-- =========================================================
create table public.staff (
  id uuid primary key references auth.users (id) on delete cascade,
  restaurant_id uuid not null, -- fk added after restaurants exists
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. RESTAURANTS
-- =========================================================
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  city text not null default 'Denver',
  address text,
  lat double precision,
  lng double precision,
  cuisine_type text,
  signature_dish text,
  partner_status text not null default 'active'
    check (partner_status in ('active', 'paused', 'onboarding', 'churned')),
  created_at timestamptz not null default now(),
  banner_url text
);

alter table public.staff
  add constraint staff_restaurant_fk
  foreign key (restaurant_id) references public.restaurants (id) on delete cascade;

-- =========================================================
-- 4. FOODLING CHARACTERS (one per restaurant, 3 evolution stages)
-- =========================================================
create table public.foodling_characters (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants (id) on delete cascade,
  name_stage1 text not null,
  name_stage2 text not null,
  name_stage3 text not null,
  art_url_stage1 text,
  art_url_stage2 text,
  art_url_stage3 text,
  xp_threshold_stage2 int not null default 50,
  xp_threshold_stage3 int not null default 150,
  created_at timestamptz not null default now(),
  constraint thresholds_increase check (xp_threshold_stage3 > xp_threshold_stage2 and xp_threshold_stage2 > 0)
);

-- =========================================================
-- 5. USER PROGRESS PER RESTAURANT
-- =========================================================
create table public.user_restaurant_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  cumulative_spend numeric(10, 2) not null default 0,
  current_xp int not null default 0,
  current_stage smallint not null default 1 check (current_stage in (1, 2, 3)),
  visit_count int not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

create index idx_urp_user on public.user_restaurant_progress (user_id);
create index idx_urp_restaurant on public.user_restaurant_progress (restaurant_id);

-- =========================================================
-- 6. CHECK-INS (append-only ledger — one row per staff-confirmed visit)
-- =========================================================
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id uuid not null references public.staff (id),
  amount numeric(10, 2) not null check (amount >= 0),
  xp_awarded int not null default 0,
  points_awarded int not null default 0,
  rate_limited boolean not null default false, -- true if xp/points were withheld due to the 4h rule
  created_at timestamptz not null default now()
);

create index idx_checkins_user_restaurant_time
  on public.checkins (user_id, restaurant_id, created_at desc);

-- =========================================================
-- 7. REWARDS + REDEMPTIONS
-- =========================================================
create table public.redeemable_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  title text not null,
  points_cost int not null check (points_cost > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  photo_url text
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reward_id uuid not null references public.redeemable_rewards (id),
  redeemed_at timestamptz not null default now()
);

create index idx_redemptions_user on public.redemptions (user_id);

-- =========================================================
-- 8. FRIENDSHIPS
-- =========================================================
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  friend_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  check (user_id <> friend_id),
  unique (user_id, friend_id)
);

create index idx_friendships_friend on public.friendships (friend_id);

-- =========================================================
-- 9. CHECK-IN RPC — the one place xp/points math + the 4h rate
-- limit + evolution logic happen. Staff portal calls this
-- (via a service-role edge function, not directly from the
-- client) after confirming an order total.
-- =========================================================
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

  -- 4-hour rate limit: check the most recent NON-rate-limited checkin.
  -- checkins.rate_limited is qualified below because RETURNS TABLE's own
  -- "rate_limited" output column otherwise makes this ambiguous.
  select created_at into v_last_checkin
  from checkins
  where user_id = p_user_id
    and restaurant_id = p_restaurant_id
    and checkins.rate_limited = false
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

  -- reward points ledger: we keep points implicitly derivable from
  -- checkins + redemptions rather than a running balance column,
  -- so no separate points table update is needed here. See the
  -- user_points view below for the computed balance.

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

-- Allow authenticated clients (the staff portal) to call the RPC. The
-- function itself enforces that p_staff_id == auth.uid() and that the
-- staff member belongs to the target restaurant, so a logged-in staff
-- account can only ever check customers in at its own restaurant.
grant execute on function public.process_checkin(uuid, uuid, uuid, numeric) to authenticated;

-- =========================================================
-- 9b. EVOLUTION THRESHOLDS RPC — lets a restaurant's staff tune how
-- much XP customers need to evolve their Foodling at that restaurant.
-- Restaurant is inferred from the caller's staff row (never passed in
-- by the client), so a staff account can only ever edit its own
-- restaurant's character. thresholds_increase on foodling_characters
-- enforces stage3 > stage2 > 0.
-- =========================================================
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

grant execute on function public.update_xp_thresholds(int, int) to authenticated;

-- =========================================================
-- 10. Computed views
-- =========================================================

-- Per-restaurant point balance for a user: points earned minus points spent.
-- Points are restaurant-specific (per the brief), so redemptions are scoped
-- by joining through redeemable_rewards.restaurant_id.
create view public.user_restaurant_points as
select
  earned.user_id,
  earned.restaurant_id,
  earned.points_earned - coalesce(spent.points_spent, 0) as points_balance
from (
  select user_id, restaurant_id, sum(points_awarded) as points_earned
  from checkins
  group by user_id, restaurant_id
) earned
left join (
  select r.user_id, rr.restaurant_id, sum(rr.points_cost) as points_spent
  from redemptions r
  join redeemable_rewards rr on rr.id = r.reward_id
  group by r.user_id, rr.restaurant_id
) spent
  on spent.user_id = earned.user_id and spent.restaurant_id = earned.restaurant_id;

-- Leaderboard helper: collection size + total xp per user
create view public.leaderboard as
select
  u.id as user_id,
  u.display_name,
  u.avatar_url,
  count(distinct urp.restaurant_id) filter (where urp.current_stage >= 1) as collection_size,
  coalesce(sum(urp.current_xp), 0) as total_xp
from users u
left join user_restaurant_progress urp on urp.user_id = u.id
group by u.id, u.display_name, u.avatar_url;

-- =========================================================
-- 11. Row Level Security
-- =========================================================
alter table public.users enable row level security;
alter table public.staff enable row level security;
alter table public.restaurants enable row level security;
alter table public.foodling_characters enable row level security;
alter table public.user_restaurant_progress enable row level security;
alter table public.checkins enable row level security;
alter table public.redeemable_rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.friendships enable row level security;

-- users: everyone can read basic profiles (needed for leaderboard/friends),
-- but only the owner can update their own row.
create policy "users are publicly readable" on public.users
  for select using (true);
create policy "users can update own profile" on public.users
  for update using (auth.uid() = id);

-- restaurants + characters + rewards: public read (directory browsing),
-- writes restricted to service role (admin dashboard uses service key).
create policy "restaurants are publicly readable" on public.restaurants
  for select using (true);
create policy "characters are publicly readable" on public.foodling_characters
  for select using (true);
create policy "rewards are publicly readable" on public.redeemable_rewards
  for select using (true);

-- staff: staff can read their own row only (portal auth check); no public access.
create policy "staff can read own row" on public.staff
  for select using (auth.uid() = id);

-- progress: users can read only their own progress.
create policy "users read own progress" on public.user_restaurant_progress
  for select using (auth.uid() = user_id);
-- inserts/updates to progress only happen via the process_checkin() function
-- (security definer), so no direct insert/update policy is granted here.

-- checkins: users can read their own check-in history.
create policy "users read own checkins" on public.checkins
  for select using (auth.uid() = user_id);
-- inserts happen only via process_checkin().

-- redemptions: users can read + create their own redemptions.
create policy "users read own redemptions" on public.redemptions
  for select using (auth.uid() = user_id);
create policy "users create own redemptions" on public.redemptions
  for insert with check (auth.uid() = user_id);

-- friendships: visible to either side of the friendship; either side can
-- update status (accept); requester can create.
create policy "users read own friendships" on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "users create friend requests" on public.friendships
  for insert with check (auth.uid() = user_id);
create policy "users respond to friend requests" on public.friendships
  for update using (auth.uid() = friend_id or auth.uid() = user_id);

-- =========================================================
-- 12. Indexes for common query patterns
-- =========================================================
create index idx_restaurants_city on public.restaurants (city);
create index idx_restaurants_partner_status on public.restaurants (partner_status);
create index idx_rewards_restaurant on public.redeemable_rewards (restaurant_id) where active;
