-- =========================================================
-- Catch-up migration: these objects are already live on the linked
-- project but were never captured into schema.sql/migrations, so a
-- fresh `supabase db push` from this repo wouldn't reproduce them.
-- Pulled directly from the live database on 2026-08-21 via
-- `supabase db query --linked` (works without Docker — hits Postgres
-- through the Management API) using pg_get_functiondef/pg_get_viewdef/
-- pg_policies/information_schema, not reconstructed from client code.
--
-- ONE FIX APPLIED HERE, not yet applied live: apply_review_bonus()
-- on the live project still references `foodiemon_characters`, the
-- pre-rebrand table name that no longer exists (renamed to
-- `foodling_characters` by 20260819010000_rename_foodling_characters.sql).
-- That means every review insert currently fails live with
-- "relation foodiemon_characters does not exist" — the review flow is
-- broken in production right now. The version below uses the correct
-- table name; see the note above the function for how to apply the
-- same one-line fix to the live project.
-- =========================================================

-- ---------------------------------------------------------
-- users.instagram_handle — optional handle shown on Profile/PublicProfile
-- ---------------------------------------------------------
alter table public.users add column if not exists instagram_handle text;

-- ---------------------------------------------------------
-- redemptions: pending -> fulfilled/cancelled flow. create_pending_redemption
-- reserves points and inserts a 'pending' row (10-minute expiry, lazily
-- swept to 'cancelled' on next call); fulfill_redemption (staff scanning the
-- QR in RedeemQRScreen / StaffRewardsManager) sets it to 'fulfilled'.
-- ---------------------------------------------------------
alter table public.redemptions add column if not exists status text not null default 'pending';
alter table public.redemptions add column if not exists fulfilled_at timestamptz;
alter table public.redemptions add column if not exists fulfilled_by uuid;

alter table public.redemptions drop constraint if exists redemptions_status_check;
alter table public.redemptions add constraint redemptions_status_check
  check (status = any (array['pending', 'fulfilled', 'cancelled']));

-- ---------------------------------------------------------
-- DAILY DEALS + SAVED DEALS
-- Staff-portal (StaffDailyDealsManager) creates time-limited deal posts per
-- restaurant; DailyDealsScreen/CharacterDetailScreen show the active one and
-- let a user bookmark it via saved_deals.
-- ---------------------------------------------------------
create table if not exists public.daily_deals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  photo_url text not null,
  description text not null,
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now()
);

create table if not exists public.saved_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  deal_id uuid not null references public.daily_deals (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, deal_id)
);

alter table public.daily_deals enable row level security;
alter table public.saved_deals enable row level security;

create policy "deals are publicly readable" on public.daily_deals
  for select using (true);
create policy "Staff can insert deals for their restaurant" on public.daily_deals
  for insert with check (restaurant_id in (select staff.restaurant_id from staff where staff.id = auth.uid()));
create policy "Staff can update deals for their restaurant" on public.daily_deals
  for update using (restaurant_id in (select staff.restaurant_id from staff where staff.id = auth.uid()));
create policy "Staff can delete deals for their restaurant" on public.daily_deals
  for delete using (restaurant_id in (select staff.restaurant_id from staff where staff.id = auth.uid()));

create policy "users read own saved deals" on public.saved_deals
  for select using (auth.uid() = user_id);
create policy "users save deals" on public.saved_deals
  for insert with check (auth.uid() = user_id);
create policy "users unsave deals" on public.saved_deals
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- REVIEWS + restaurant_ratings
-- xp_awarded/points_awarded default to a flat 25/25 bonus per review
-- (stamped at insert time via column default, not computed) — enforced by
-- reviews_award_bonus below. reviews_limit_check caps a user at 10 reviews
-- per restaurant server-side (CharacterDetailScreen's MAX_REVIEWS_PER_USER
-- is a client-side mirror of this, not the enforcement point).
-- ---------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  restaurant_id uuid not null references public.restaurants (id),
  body text not null,
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  photo_url text,
  xp_awarded int not null default 25,
  points_awarded int not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Reviews are publicly viewable" on public.reviews
  for select using (true);
create policy "Checked-in users can leave a review" on public.reviews
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from checkins
      where checkins.user_id = auth.uid() and checkins.restaurant_id = reviews.restaurant_id
    )
  );
create policy "Users can edit their own review" on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own review" on public.reviews
  for delete using (auth.uid() = user_id);

create or replace view public.restaurant_ratings as
select
  restaurant_id,
  round(avg(rating), 1) as average_rating,
  count(rating) as rating_count
from public.reviews
where rating is not null
group by restaurant_id;

-- Caps a user at 10 reviews per restaurant. Live/unchanged from production.
create or replace function public.enforce_review_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from reviews where user_id = new.user_id and restaurant_id = new.restaurant_id) >= 10 then
    raise exception 'You can leave up to 10 reviews per restaurant.';
  end if;
  return new;
end;
$$;

-- Adds the review's xp_awarded to the user's progress at this restaurant and
-- recalculates their stage — the same threshold logic process_checkin uses.
--
-- FIXED here vs. live: the live version of this function still selects
-- from `foodiemon_characters`, which was renamed to `foodling_characters`
-- during the rebrand (20260819010000_rename_foodling_characters.sql) and no
-- longer exists — so every review insert on the live project currently
-- fails with "relation foodiemon_characters does not exist". To apply this
-- same fix to the live project, run just this CREATE OR REPLACE (it's
-- idempotent and safe to run standalone against the linked project).
create or replace function public.apply_review_bonus()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_xp integer;
  v_stage integer;
  v_thresh2 integer;
  v_thresh3 integer;
begin
  select xp_threshold_stage2, xp_threshold_stage3
  into v_thresh2, v_thresh3
  from foodling_characters
  where restaurant_id = new.restaurant_id;

  update user_restaurant_progress
  set current_xp = current_xp + new.xp_awarded
  where user_id = new.user_id and restaurant_id = new.restaurant_id
  returning current_xp into v_new_xp;

  if v_new_xp is not null then
    v_stage := 1;
    if v_new_xp >= v_thresh3 then
      v_stage := 3;
    elsif v_new_xp >= v_thresh2 then
      v_stage := 2;
    end if;

    update user_restaurant_progress
    set current_stage = v_stage
    where user_id = new.user_id and restaurant_id = new.restaurant_id;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_limit_check on public.reviews;
create trigger reviews_limit_check
  before insert on public.reviews
  for each row execute function public.enforce_review_limit();

drop trigger if exists reviews_award_bonus on public.reviews;
create trigger reviews_award_bonus
  after insert on public.reviews
  for each row execute function public.apply_review_bonus();

-- ---------------------------------------------------------
-- REDEMPTION RPCs — called by CharacterDetailScreen (create_pending_redemption)
-- and StaffRewardsManager's QR scanner (fulfill_redemption).
-- ---------------------------------------------------------
create or replace function public.create_pending_redemption(p_reward_id uuid)
returns table (success boolean, redemption_id uuid, expires_at timestamptz, message text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id uuid;
  v_cost integer;
  v_active boolean;
  v_balance bigint;
  v_new_id uuid;
begin
  if v_user_id is null then
    return query select false, null::uuid, null::timestamptz, 'Not authenticated.';
    return;
  end if;

  -- Lazily expire this user's own stale pending redemptions
  update redemptions
  set status = 'cancelled'
  where user_id = v_user_id
    and status = 'pending'
    and redeemed_at < now() - interval '10 minutes';

  select points_cost, active, restaurant_id
  into v_cost, v_active, v_restaurant_id
  from redeemable_rewards
  where id = p_reward_id;

  if not found then
    return query select false, null::uuid, null::timestamptz, 'Reward not found.';
    return;
  end if;

  if not v_active then
    return query select false, null::uuid, null::timestamptz, 'This reward is no longer available.';
    return;
  end if;

  select coalesce(points_balance, 0) into v_balance
  from user_restaurant_points
  where user_id = v_user_id and restaurant_id = v_restaurant_id;

  if v_balance < v_cost then
    return query select false, null::uuid, null::timestamptz, 'Not enough points.';
    return;
  end if;

  insert into redemptions (user_id, reward_id, status)
  values (v_user_id, p_reward_id, 'pending')
  returning id into v_new_id;

  return query select true, v_new_id, now() + interval '10 minutes', 'Reservation created — show this to staff.';
end;
$$;

create or replace function public.fulfill_redemption(p_redemption_id uuid, p_staff_id uuid, p_restaurant_id uuid)
returns table (success boolean, reward_title text, points_spent integer, message text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_reward_id uuid;
  v_reward_restaurant uuid;
  v_cost integer;
  v_title text;
  v_redeemed_at timestamptz;
begin
  select status, reward_id, redeemed_at
  into v_status, v_reward_id, v_redeemed_at
  from redemptions
  where id = p_redemption_id
  for update;

  if not found then
    return query select false, null::text, null::integer, 'Redemption not found.';
    return;
  end if;

  select restaurant_id, points_cost, title
  into v_reward_restaurant, v_cost, v_title
  from redeemable_rewards
  where id = v_reward_id;

  if v_reward_restaurant <> p_restaurant_id then
    return query select false, v_title, v_cost, 'This reward belongs to a different restaurant.';
    return;
  end if;

  if v_status = 'fulfilled' then
    return query select false, v_title, v_cost, 'Already redeemed.';
    return;
  end if;

  if v_status = 'cancelled' or v_redeemed_at < now() - interval '10 minutes' then
    update redemptions set status = 'cancelled' where id = p_redemption_id and status = 'pending';
    return query select false, v_title, v_cost, 'This code expired — ask the customer to redeem again.';
    return;
  end if;

  update redemptions
  set status = 'fulfilled', fulfilled_by = p_staff_id, fulfilled_at = now()
  where id = p_redemption_id;

  return query select true, v_title, v_cost, 'Confirmed!';
end;
$$;

-- ---------------------------------------------------------
-- ADMIN RPC — used by the staff-portal Admin dashboard's Staff tab to list
-- staff alongside their auth.users email (which RLS wouldn't otherwise
-- expose to a client query). Hardcodes the one admin email rather than a
-- role/claim — matches ADMIN_EMAILS in staff-portal/src/App.jsx, which
-- gates the UI tab itself; this is the corresponding server-side check.
-- ---------------------------------------------------------
create or replace function public.admin_list_staff_with_email()
returns table (id uuid, restaurant_id uuid, display_name text, active boolean, email text)
language plpgsql
security definer
as $$
begin
  if auth.jwt() ->> 'email' <> 'fernando.lambar@gmail.com' then
    raise exception 'Not authorized';
  end if;

  return query
  select s.id, s.restaurant_id, s.display_name, s.active, u.email::text
  from staff s
  join auth.users u on u.id = s.id;
end;
$$;
