-- Lets staff show a photo of the actual reward item (garlic knots, a free
-- slice, etc.) next to it in the app instead of a generic gift icon.
-- Optional — non-food rewards (discounts, free delivery) can leave it
-- blank and keep the fallback icon.
alter table public.redeemable_rewards
  add column if not exists photo_url text;
