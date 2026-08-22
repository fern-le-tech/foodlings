-- CheckInQRScreen listens for its own new checkins row (postgres_changes
-- INSERT, filtered to auth.uid()) so the customer sees a confirmation the
-- instant staff scans them — the same pattern RedeemQRScreen already uses
-- for redemptions. That subscription was added but checkins was never
-- added to the supabase_realtime publication, so no events were ever
-- delivered. redemptions and user_restaurant_progress were already enabled
-- (confirmed via pg_publication_tables); this brings checkins in line.
alter publication supabase_realtime add table public.checkins;
