-- Character Detail's "About" tab had no real description of the restaurant
-- itself (only address, deals, and rewards) — staff need a place to write
-- a short blurb ("vibrant Mexican spot in RiNo known for tacos...").
alter table public.restaurants
  add column if not exists bio text;
