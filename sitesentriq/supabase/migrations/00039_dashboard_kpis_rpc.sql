-- 00039_dashboard_kpis_rpc.sql
--
-- Wave 17 perf — replace the dashboard's 5 unbounded SELECTs with a
-- single Postgres RPC.
--
-- Before: useDashboardKpis pulled every row of compliance_items + jobs +
-- actions + engineers + invoices and aggregated in JS. For real org data
-- that's MBs of JSON over the wire on every dashboard mount (every 5 min
-- once the TanStack cache expires).
--
-- After: one RPC call returns the 6 headline numbers, 6 sparkline arrays,
-- and 6 deltas — all aggregated by Postgres which is what it's good at.
-- Response is ~600 bytes regardless of org size.
--
-- Security model: SECURITY INVOKER — the function runs as the calling
-- user, so RLS on the underlying tables is the only thing that gates
-- access. The function only ever reads rows where organisation_id matches
-- the caller's profile.organisation_id, so even if RLS were bypassed it
-- couldn't leak across orgs.

create or replace function public.pct_change(current_v numeric, previous_v numeric)
returns numeric
language sql
immutable
as $$
  select case
    when previous_v = 0 and current_v = 0 then 0
    when previous_v = 0 then 100
    else round(((current_v - previous_v) / abs(previous_v)) * 100)
  end;
$$;

create or replace function public.dashboard_kpis()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
    -- Resolve caller's org. NULL when the user has no profile row
    -- (mid-signup) — caller gets all-zeroes back rather than an error.
    me as (
      select organisation_id as org_id
      from public.profiles
      where id = auth.uid()
    ),
    -- 7 trailing days, oldest first — matches the JS lastNDays(7).
    days as (
      select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as d
    ),

    -- ── Compliance ─────────────────────────────────────────────────
    compliance_now as (
      select
        count(*) filter (where status = 'compliant') as compliant_n,
        count(*) as total_n,
        count(*) filter (where status = 'overdue') as overdue_n
      from public.compliance_items
      where organisation_id = (select org_id from me)
    ),
    compliance_spark_rows as (
      select d.d as day,
        count(c.*) filter (where c.created_at::date <= d.d) as total,
        count(c.*) filter (where c.created_at::date <= d.d and c.status = 'compliant') as ok
      from days d
      left join public.compliance_items c on c.organisation_id = (select org_id from me)
      group by d.d
    ),
    compliance_spark as (
      select array_agg(
        case when total = 0 then 0
             else round(100.0 * ok / total)::int end
        order by day
      ) as spark
      from compliance_spark_rows
    ),

    -- ── Open jobs (status not completed/cancelled) ─────────────────
    jobs_now as (
      select count(*) filter (where status not in ('completed','cancelled')) as open_n
      from public.jobs
      where organisation_id = (select org_id from me)
    ),
    jobs_spark as (
      select array_agg(t.cnt order by t.day) as spark
      from (
        select d.d as day,
          count(j.*) filter (
            where j.created_at::date <= d.d
              and (j.completed_date is null or j.completed_date::date > d.d)
          ) as cnt
        from days d
        left join public.jobs j on j.organisation_id = (select org_id from me)
        group by d.d
      ) t
    ),

    -- ── Overdue items (compliance status='overdue' + actions past due) ─
    overdue_now as (
      select
        (select count(*) from public.compliance_items
          where organisation_id = (select org_id from me)
            and status = 'overdue')
        +
        (select count(*) from public.actions
          where organisation_id = (select org_id from me)
            and status not in ('completed','cancelled')
            and due_date is not null
            and due_date < current_date)
        as cnt
    ),
    overdue_spark as (
      select array_agg(t.cnt order by t.day) as spark
      from (
        select d.d as day,
          coalesce((
            select count(*) from public.compliance_items
            where organisation_id = (select org_id from me)
              and status = 'overdue'
              and created_at::date <= d.d
          ), 0)
          +
          coalesce((
            select count(*) from public.actions
            where organisation_id = (select org_id from me)
              and status not in ('completed','cancelled')
              and due_date is not null
              and due_date < d.d
              and created_at::date <= d.d
          ), 0) as cnt
        from days d
      ) t
    ),

    -- ── Active engineers ───────────────────────────────────────────
    engineers_now as (
      select count(*) filter (where status = 'active') as cnt
      from public.engineers
      where organisation_id = (select org_id from me)
    ),
    engineers_spark as (
      select array_agg(t.cnt order by t.day) as spark
      from (
        select d.d as day,
          count(e.*) filter (where e.status = 'active' and e.created_at::date <= d.d) as cnt
        from days d
        left join public.engineers e on e.organisation_id = (select org_id from me)
        group by d.d
      ) t
    ),

    -- ── Revenue MTD (paid invoices this calendar month) ────────────
    revenue_now as (
      select coalesce(sum(total), 0) as cnt
      from public.invoices
      where organisation_id = (select org_id from me)
        and paid_date >= date_trunc('month', current_date)::date
        and paid_date <  (date_trunc('month', current_date) + interval '1 month')::date
    ),
    revenue_prev as (
      select coalesce(sum(total), 0) as cnt
      from public.invoices
      where organisation_id = (select org_id from me)
        and paid_date >= (date_trunc('month', current_date) - interval '1 month')::date
        and paid_date <  date_trunc('month', current_date)::date
    ),
    revenue_spark as (
      select array_agg(t.cnt order by t.day) as spark
      from (
        select d.d as day,
          coalesce((
            select sum(total) from public.invoices
            where organisation_id = (select org_id from me)
              and paid_date = d.d
          ), 0) as cnt
        from days d
      ) t
    ),

    -- ── Outstanding invoices (unpaid, not cancelled) ───────────────
    outstanding_now as (
      select coalesce(sum(total), 0) as cnt
      from public.invoices
      where organisation_id = (select org_id from me)
        and status not in ('paid','cancelled')
    ),
    outstanding_spark as (
      select array_agg(t.cnt order by t.day) as spark
      from (
        select d.d as day,
          coalesce((
            select sum(total) from public.invoices
            where organisation_id = (select org_id from me)
              and created_at::date <= d.d
              and status <> 'cancelled'
              and (paid_date is null or paid_date > d.d)
          ), 0) as cnt
        from days d
      ) t
    )

  select jsonb_build_object(
    'compliancePct', case
      when (select total_n from compliance_now) = 0 then 0
      else round(100.0 * (select compliant_n from compliance_now) / (select total_n from compliance_now))::int
    end,
    'compliancePctDelta',
      case
        when (select total_n from compliance_now) = 0 then 0
        else round(100.0 * (select compliant_n from compliance_now) / (select total_n from compliance_now))::int
      end
      - coalesce(((select spark from compliance_spark))[1], 0),
    'complianceSparkline', coalesce(to_jsonb((select spark from compliance_spark)), '[]'::jsonb),

    'openJobs', (select open_n from jobs_now),
    'openJobsDelta', public.pct_change(
      (select open_n from jobs_now)::numeric,
      coalesce(((select spark from jobs_spark))[1], 0)::numeric
    ),
    'openJobsSparkline', coalesce(to_jsonb((select spark from jobs_spark)), '[]'::jsonb),

    'overdueItems', (select cnt from overdue_now),
    'overdueItemsDelta', public.pct_change(
      (select cnt from overdue_now)::numeric,
      coalesce(((select spark from overdue_spark))[1], 0)::numeric
    ),
    'overdueItemsSparkline', coalesce(to_jsonb((select spark from overdue_spark)), '[]'::jsonb),

    'activeEngineers', (select cnt from engineers_now),
    'activeEngineersDelta', public.pct_change(
      (select cnt from engineers_now)::numeric,
      coalesce(((select spark from engineers_spark))[1], 0)::numeric
    ),
    'activeEngineersSparkline', coalesce(to_jsonb((select spark from engineers_spark)), '[]'::jsonb),

    'revenueMtd', (select cnt from revenue_now),
    'revenueMtdDelta', public.pct_change(
      (select cnt from revenue_now)::numeric,
      (select cnt from revenue_prev)::numeric
    ),
    'revenueMtdSparkline', coalesce(to_jsonb((select spark from revenue_spark)), '[]'::jsonb),

    'outstandingInvoices', (select cnt from outstanding_now),
    'outstandingInvoicesDelta', public.pct_change(
      (select cnt from outstanding_now)::numeric,
      coalesce(((select spark from outstanding_spark))[1], 0)::numeric
    ),
    'outstandingInvoicesSparkline', coalesce(to_jsonb((select spark from outstanding_spark)), '[]'::jsonb)
  );
$$;

grant execute on function public.dashboard_kpis() to authenticated;
grant execute on function public.pct_change(numeric, numeric) to authenticated;

-- ──────────────────────────────────────────────────────────────────
-- me() — single-call profile + organisation resolver. Replaces the
-- two sequential round-trips (profiles + organisations) the auth
-- bootstrap currently does, cutting ~50–150 ms off every cold load.
-- Returns NULLs for anonymous callers; the client falls back to the
-- existing tenant_user / signup paths if the profile row is missing
-- or has no organisation_id (auto-create-org flow).
-- ──────────────────────────────────────────────────────────────────
create or replace function public.me()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile',      to_jsonb(p.*),
    'organisation', to_jsonb(o.*)
  )
  from public.profiles p
  left join public.organisations o on o.id = p.organisation_id
  where p.id = auth.uid();
$$;

grant execute on function public.me() to authenticated;
