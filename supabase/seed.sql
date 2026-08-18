-- Example seed row — duplicate this pattern for your 10-15 launch partners.
-- Run after schema.sql. Replace art_url_* with real Supabase Storage URLs.

insert into public.restaurants (id, name, neighborhood, city, address, lat, lng, cuisine_type, signature_dish)
values (
  '00000000-0000-0000-0000-000000000001',
  'Sample Green Chile Co.',
  'RiNo',
  'Denver',
  '123 Larimer St, Denver, CO',
  39.7621,
  -104.9884,
  'Southwestern',
  'Pork Green Chile Bowl'
);

insert into public.foodiemon_characters (
  restaurant_id, name_stage1, name_stage2, name_stage3,
  xp_threshold_stage2, xp_threshold_stage3
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Chilibud', 'Chiliblaze', 'Chiliferno',
  50, 150
);

insert into public.redeemable_rewards (restaurant_id, title, points_cost)
values
  ('00000000-0000-0000-0000-000000000001', 'Free chips & salsa', 15),
  ('00000000-0000-0000-0000-000000000001', 'Free entree', 60);
