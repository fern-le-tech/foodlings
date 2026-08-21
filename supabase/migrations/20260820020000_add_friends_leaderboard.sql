-- LeaderboardScreen has a standing TODO to scope the leaderboard to the
-- caller's accepted friends instead of every user. Add an RPC that does
-- that filtering server-side (friendships is RLS-restricted to rows the
-- caller is part of, so a client-side join can't see the friend's row).
create or replace function public.friends_leaderboard()
returns setof leaderboard
language sql
security definer set search_path = public
stable
as $$
  select l.*
  from leaderboard l
  where l.user_id = auth.uid()
     or l.user_id in (
       select friend_id from friendships
       where user_id = auth.uid() and status = 'accepted'
       union
       select user_id from friendships
       where friend_id = auth.uid() and status = 'accepted'
     )
$$;

grant execute on function public.friends_leaderboard() to authenticated;
