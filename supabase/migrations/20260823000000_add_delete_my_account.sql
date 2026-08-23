-- Self-service account deletion, callable from the mobile app's Profile
-- screen. Google/Apple both increasingly require an in-app deletion path,
-- not just a "contact us" process.
--
-- auth.users cascade-deletes public.users, which in turn cascade-deletes
-- checkins, redemptions, user_restaurant_progress, friendships, and
-- saved_deals (all declared ON DELETE CASCADE). reviews.user_id was NOT
-- declared cascade (see 20260821000000_capture_deals_reviews_redemption_status.sql,
-- captured as-is from the live schema), so it's cleared explicitly here first
-- or the whole deletion would fail with a foreign key violation the moment
-- someone with a review tried to delete their account.
--
-- Blocks staff/admin accounts from self-deleting via this path — deleting a
-- restaurant's only staff account (or an admin) has consequences well
-- beyond the one person's own data, so that stays a manual/support action.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated.';
  end if;

  if exists (select 1 from staff where id = v_uid) then
    raise exception 'Staff and admin accounts can''t self-delete here — contact support to close a staff account.';
  end if;

  delete from reviews where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
