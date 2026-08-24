-- Storage bucket for reward photos, mirroring daily-deal-photos: public
-- read, any staff account can upload/delete (not scoped to their own
-- restaurant_id, same as the existing daily-deal-photos policy — RLS on
-- redeemable_rewards itself is what actually keeps staff editing only
-- their own restaurant's rows).
insert into storage.buckets (id, name, public)
values ('reward-photos', 'reward-photos', true)
on conflict (id) do nothing;

create policy "Public read reward photos"
  on storage.objects for select
  using (bucket_id = 'reward-photos');

create policy "Staff can upload reward photos"
  on storage.objects for insert
  with check (bucket_id = 'reward-photos' and auth.uid() in (select id from staff));

create policy "Staff can delete their reward photos"
  on storage.objects for delete
  using (bucket_id = 'reward-photos' and auth.uid() in (select id from staff));
