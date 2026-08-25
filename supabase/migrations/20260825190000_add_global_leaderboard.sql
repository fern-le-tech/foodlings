-- Leaderboard now has two scopes: global (everyone) and friends (existing
-- friends_leaderboard). Needs the same security-definer treatment as
-- friends_leaderboard -- user_restaurant_progress's "users read own
-- progress" RLS policy means a plain client-side select against the
-- `leaderboard` view would silently zero out every other user's stats
-- (the LEFT JOIN just can't see rows RLS blocks), even though `users`
-- itself is publicly readable.
create or replace function public.global_leaderboard()
returns setof leaderboard
language sql
security definer set search_path = public
stable
as $$
  select * from leaderboard
$$;

grant execute on function public.global_leaderboard() to authenticated;
