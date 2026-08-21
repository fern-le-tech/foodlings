-- The client's AcceptFriendRequestScreen calls public.accept_friend_invite(),
-- but this RPC was never created live — every invite accept has been
-- failing silently into the screen's generic error state. This adds it.
create or replace function public.accept_friend_invite(p_inviter_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if p_inviter_id = auth.uid() then
    raise exception 'cannot friend yourself';
  end if;

  if not exists (select 1 from users where id = p_inviter_id) then
    raise exception 'inviter % not found', p_inviter_id;
  end if;

  -- The inviter never had a pending row created on their side (the invite
  -- link just carries their id, no row is written until acceptance) but
  -- accepting twice, or accepting a link when the inviter already sent one
  -- the other way, should still land on a single accepted pair rather than
  -- erroring or duplicating.
  if exists (
    select 1 from friendships where user_id = auth.uid() and friend_id = p_inviter_id
  ) then
    update friendships set status = 'accepted'
    where user_id = auth.uid() and friend_id = p_inviter_id;
  else
    insert into friendships (user_id, friend_id, status)
    values (p_inviter_id, auth.uid(), 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
  end if;
end;
$$;

grant execute on function public.accept_friend_invite(uuid) to authenticated;
