-- Lets staff link their restaurant's Instagram/Facebook from the character
-- page's About tab, right under the bio (icon-only, tap to open) — mirrors
-- users.instagram_handle's pattern on Profile, but scoped to the restaurant
-- and editable any time (unlike bio, which is creation-only).
alter table public.restaurants
  add column if not exists instagram_handle text,
  add column if not exists facebook_handle text;
