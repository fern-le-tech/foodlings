-- =========================================================
-- Catch-up migration: these objects are already live on the linked
-- project (confirmed via `npx supabase gen types typescript --linked`
-- on 2026-08-21) but were never captured into schema.sql/migrations,
-- so a fresh `supabase db push` from this repo would not reproduce
-- them. Table/view DDL below is transcribed from the live column
-- list, types, nullability and foreign keys, which the generated
-- types give exactly.
--
-- NOT captured here — Docker isn't available in this environment, so
-- `supabase db dump`/`db diff` (which shell out to pg_dump) couldn't
-- run, and there's no way to introspect these without guessing:
--   * RLS policies on the tables added below
--   * The bodies of create_pending_redemption, fulfill_redemption,
--     and admin_list_staff_with_email (signatures only, from
--     gen types) — and whatever review-insert trigger sets
--     reviews.xp_awarded/points_awarded
--   * Any indexes/triggers beyond what's implied by the FKs below
-- Pull these from the Supabase dashboard (Database > Functions /
-- Policies) before treating this file as the full source of truth.
-- =========================================================

-- ---------------------------------------------------------
-- users.instagram_handle — optional handle shown on Profile/PublicProfile
-- ---------------------------------------------------------
alter table public.users add column if not exists instagram_handle text;

-- ---------------------------------------------------------
-- redemptions: pending → fulfilled flow (create_pending_redemption reserves
-- points and inserts a 'pending' row; fulfill_redemption, called by staff
-- scanning the QR in RedeemQRScreen, sets status/fulfilled_at/fulfilled_by).
-- `status` is left as text (not a check constraint) since only "fulfilled"
-- is confirmed by client code — add a check constraint once the full set
-- of values used by fulfill_redemption is confirmed from its definition.
-- ---------------------------------------------------------
alter table public.redemptions add column if not exists status text not null default 'pending';
alter table public.redemptions add column if not exists fulfilled_at timestamptz;
alter table public.redemptions add column if not exists fulfilled_by uuid references public.staff (id);

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

create index if not exists idx_daily_deals_restaurant on public.daily_deals (restaurant_id);
create index if not exists idx_daily_deals_active_expires on public.daily_deals (active, expires_at);

create table if not exists public.saved_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  deal_id uuid not null references public.daily_deals (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, deal_id)
);

create index if not exists idx_saved_deals_user on public.saved_deals (user_id);

alter table public.daily_deals enable row level security;
alter table public.saved_deals enable row level security;

create policy "daily deals are publicly readable" on public.daily_deals
  for select using (true);
create policy "users manage own saved deals" on public.saved_deals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------
-- REVIEWS + restaurant_ratings
-- One review per user per (restaurant, review) — CharacterDetailScreen caps
-- a user at MAX_REVIEWS_PER_USER = 10 client-side, not enforced here.
-- xp_awarded/points_awarded are stamped on the row by whatever
-- server-side logic grants the review bonus (trigger, presumably —
-- not reconstructed here since guessing the award amount would be
-- worse than leaving it undocumented).
-- ---------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  body text not null,
  rating smallint check (rating between 1 and 5),
  photo_url text,
  xp_awarded int not null default 0,
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reviews_restaurant on public.reviews (restaurant_id);
create index if not exists idx_reviews_user on public.reviews (user_id);

alter table public.reviews enable row level security;

create policy "reviews are publicly readable" on public.reviews
  for select using (true);
create policy "users manage own reviews" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create view public.restaurant_ratings as
select
  restaurant_id,
  round(avg(rating) filter (where rating is not null), 1) as average_rating,
  count(*) filter (where rating is not null) as rating_count
from public.reviews
group by restaurant_id;
