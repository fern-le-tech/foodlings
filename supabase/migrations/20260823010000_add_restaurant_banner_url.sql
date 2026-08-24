-- "Restaurants Near You" cards on Home need a hero photo per restaurant —
-- restaurants had no photo field at all (only foodling_characters art,
-- which is the collectible creature, not the venue itself).
alter table public.restaurants
  add column if not exists banner_url text;
