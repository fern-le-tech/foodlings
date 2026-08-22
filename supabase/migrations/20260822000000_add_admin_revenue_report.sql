-- Admin dashboard Overview tab: revenue/check-in reporting across all
-- restaurants for a picked date range. checkins is RLS-restricted to each
-- customer's own rows ("users read own checkins"), so an admin querying it
-- directly would only ever see their own check-ins, not the platform's —
-- this RPC bypasses that the same way admin_list_staff_with_email does,
-- gated to the same hardcoded admin email.
--
-- checkins.amount is always the real transaction amount staff typed in,
-- whether or not xp/points were withheld by the 4h rate limit, so summing
-- it unconditionally (no rate_limited filter) is the correct revenue figure.
--
-- One row per restaurant per call (including restaurants with zero
-- check-ins in range, via the left join) — the client sums these for the
-- combined "all restaurants" total rather than this returning two shapes.
create or replace function public.admin_revenue_report(p_start_date date, p_end_date date)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  partner_status text,
  checkin_count bigint,
  revenue numeric
)
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'fernando.lambar@gmail.com' then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.id,
    r.name,
    r.partner_status,
    count(c.id) as checkin_count,
    coalesce(sum(c.amount), 0) as revenue
  from restaurants r
  left join checkins c
    on c.restaurant_id = r.id
    and c.created_at >= p_start_date::timestamptz
    and c.created_at < (p_end_date + 1)::date::timestamptz
  group by r.id, r.name, r.partner_status
  order by r.name;
end;
$$;

grant execute on function public.admin_revenue_report(date, date) to authenticated;
