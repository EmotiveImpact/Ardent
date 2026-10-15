-- Migration: 00116_subcontractor_compliance.sql
-- Description: subcontractor compliance gating (trust wave W2-T5).
--   Insurance policies, accreditations (SSIP/CHAS/...), RAMS with approval,
--   per-org requirement matrix, a compliance-status evaluator, and a dispatch
--   gate: assigning a job to a non-compliant subcontractor is blocked unless
--   an org admin records an override reason.
--
-- Competitive research (2026-06): contractor vetting wired into dispatch is
-- the Vantify/Prosure360 model UK FM clients now expect; no mid-market tool
-- builds it into job assignment itself.
--
-- House style: org RLS 4-policy pattern (00056); SECURITY DEFINER trigger is
-- fully schema-qualified under search_path='' (the 00086/PPM lesson); the
-- gate fires ONLY on subcontractor assignment so no other job write path
-- (web/mobile/portal callout/PPM RPC) can be affected.

-- ── 1. Insurance policies ──────────────────────────────────────────────

create table if not exists public.subcontractor_insurance_policies (
  id                         uuid primary key default gen_random_uuid(),
  organisation_id            uuid not null references public.organisations(id) on delete cascade,
  subcontractor_id           uuid not null references public.subcontractors(id) on delete cascade,
  policy_type                text not null check (policy_type in
    ('public_liability', 'employers_liability', 'professional_indemnity', 'contractors_all_risk', 'other')),
  insurer                    text,
  policy_number              text,
  cover_amount               numeric(12,2),
  start_date                 date,
  expiry_date                date not null,
  subcontractor_document_id  uuid references public.subcontractor_documents(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_sub_insurance_sub on public.subcontractor_insurance_policies(subcontractor_id);
create index if not exists idx_sub_insurance_org_expiry on public.subcontractor_insurance_policies(organisation_id, expiry_date);

drop trigger if exists set_sub_insurance_updated_at on public.subcontractor_insurance_policies;
create trigger set_sub_insurance_updated_at
  before update on public.subcontractor_insurance_policies
  for each row execute function public.update_updated_at_column();

-- ── 2. Accreditations ──────────────────────────────────────────────────

create table if not exists public.subcontractor_accreditations (
  id                         uuid primary key default gen_random_uuid(),
  organisation_id            uuid not null references public.organisations(id) on delete cascade,
  subcontractor_id           uuid not null references public.subcontractors(id) on delete cascade,
  scheme                     text not null check (scheme in
    ('ssip', 'chas', 'safecontractor', 'constructionline', 'niceic', 'gas_safe', 'other')),
  reference                  text,
  expiry_date                date,
  subcontractor_document_id  uuid references public.subcontractor_documents(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_sub_accreditations_sub on public.subcontractor_accreditations(subcontractor_id);
create index if not exists idx_sub_accreditations_org_expiry on public.subcontractor_accreditations(organisation_id, expiry_date);

drop trigger if exists set_sub_accreditations_updated_at on public.subcontractor_accreditations;
create trigger set_sub_accreditations_updated_at
  before update on public.subcontractor_accreditations
  for each row execute function public.update_updated_at_column();

-- ── 3. RAMS (risk assessments & method statements) ────────────────────

create table if not exists public.subcontractor_rams (
  id                         uuid primary key default gen_random_uuid(),
  organisation_id            uuid not null references public.organisations(id) on delete cascade,
  subcontractor_id           uuid not null references public.subcontractors(id) on delete cascade,
  job_id                     uuid references public.jobs(id) on delete set null, -- null = generic RAMS
  title                      text not null,
  subcontractor_document_id  uuid references public.subcontractor_documents(id) on delete set null,
  approval_status            text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by                uuid references public.profiles(id) on delete set null,
  approved_at                timestamptz,
  valid_until                date,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_sub_rams_sub on public.subcontractor_rams(subcontractor_id);
create index if not exists idx_sub_rams_job on public.subcontractor_rams(job_id);

drop trigger if exists set_sub_rams_updated_at on public.subcontractor_rams;
create trigger set_sub_rams_updated_at
  before update on public.subcontractor_rams
  for each row execute function public.update_updated_at_column();

-- ── 4. Per-org requirement matrix ──────────────────────────────────────
-- Absent row = the default below (PL insurance + any SSIP-family scheme +
-- an approved RAMS). The org-facing editor UI is deferred — the default is
-- the UK FM norm.

create table if not exists public.subcontractor_compliance_requirements (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  required        jsonb not null default
    '{"insurance":["public_liability"],"accreditation_any_of":["ssip","chas","safecontractor"],"rams_required":true}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- ── 5. RLS (org 4-policy house pattern, 00056) ─────────────────────────

alter table public.subcontractor_insurance_policies enable row level security;
alter table public.subcontractor_accreditations enable row level security;
alter table public.subcontractor_rams enable row level security;
alter table public.subcontractor_compliance_requirements enable row level security;

drop policy if exists sub_insurance_select_org on public.subcontractor_insurance_policies;
drop policy if exists sub_insurance_insert_org on public.subcontractor_insurance_policies;
drop policy if exists sub_insurance_update_org on public.subcontractor_insurance_policies;
drop policy if exists sub_insurance_delete_org on public.subcontractor_insurance_policies;
create policy sub_insurance_select_org on public.subcontractor_insurance_policies
  for select to authenticated using (organisation_id = public.organisation_id());
create policy sub_insurance_insert_org on public.subcontractor_insurance_policies
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy sub_insurance_update_org on public.subcontractor_insurance_policies
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy sub_insurance_delete_org on public.subcontractor_insurance_policies
  for delete to authenticated using (organisation_id = public.organisation_id());

drop policy if exists sub_accreditations_select_org on public.subcontractor_accreditations;
drop policy if exists sub_accreditations_insert_org on public.subcontractor_accreditations;
drop policy if exists sub_accreditations_update_org on public.subcontractor_accreditations;
drop policy if exists sub_accreditations_delete_org on public.subcontractor_accreditations;
create policy sub_accreditations_select_org on public.subcontractor_accreditations
  for select to authenticated using (organisation_id = public.organisation_id());
create policy sub_accreditations_insert_org on public.subcontractor_accreditations
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy sub_accreditations_update_org on public.subcontractor_accreditations
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy sub_accreditations_delete_org on public.subcontractor_accreditations
  for delete to authenticated using (organisation_id = public.organisation_id());

drop policy if exists sub_rams_select_org on public.subcontractor_rams;
drop policy if exists sub_rams_insert_org on public.subcontractor_rams;
drop policy if exists sub_rams_update_org on public.subcontractor_rams;
drop policy if exists sub_rams_delete_org on public.subcontractor_rams;
create policy sub_rams_select_org on public.subcontractor_rams
  for select to authenticated using (organisation_id = public.organisation_id());
create policy sub_rams_insert_org on public.subcontractor_rams
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy sub_rams_update_org on public.subcontractor_rams
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy sub_rams_delete_org on public.subcontractor_rams
  for delete to authenticated using (organisation_id = public.organisation_id());

drop policy if exists sub_compliance_req_select_org on public.subcontractor_compliance_requirements;
drop policy if exists sub_compliance_req_insert_org on public.subcontractor_compliance_requirements;
drop policy if exists sub_compliance_req_update_org on public.subcontractor_compliance_requirements;
drop policy if exists sub_compliance_req_delete_org on public.subcontractor_compliance_requirements;
create policy sub_compliance_req_select_org on public.subcontractor_compliance_requirements
  for select to authenticated using (organisation_id = public.organisation_id());
create policy sub_compliance_req_insert_org on public.subcontractor_compliance_requirements
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy sub_compliance_req_update_org on public.subcontractor_compliance_requirements
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy sub_compliance_req_delete_org on public.subcontractor_compliance_requirements
  for delete to authenticated using (organisation_id = public.organisation_id());

-- ── 6. Compliance evaluator ────────────────────────────────────────────
-- SECURITY INVOKER: from the client, the caller's org RLS scopes every read;
-- from the SECURITY DEFINER gate trigger below, it evaluates unrestricted —
-- both are correct. Returns {compliant bool, failures text[]}.

create or replace function public.subcontractor_compliance_status(p_subcontractor_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_req jsonb;
  v_failures text[] := '{}';
  v_type text;
  v_schemes text[];
begin
  select organisation_id into v_org
  from public.subcontractors where id = p_subcontractor_id;
  if v_org is null then
    return jsonb_build_object('compliant', false, 'failures', jsonb_build_array('subcontractor not found'));
  end if;

  select required into v_req
  from public.subcontractor_compliance_requirements where organisation_id = v_org;
  if v_req is null then
    v_req := '{"insurance":["public_liability"],"accreditation_any_of":["ssip","chas","safecontractor"],"rams_required":true}'::jsonb;
  end if;

  -- Each required insurance type needs a current (unexpired) policy.
  for v_type in select jsonb_array_elements_text(coalesce(v_req->'insurance', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.subcontractor_insurance_policies p
      where p.subcontractor_id = p_subcontractor_id
        and p.policy_type = v_type
        and p.expiry_date >= current_date
    ) then
      v_failures := v_failures || ('insurance:' || v_type);
    end if;
  end loop;

  -- At least ONE current accreditation among the accepted schemes.
  select coalesce(array_agg(s), '{}') into v_schemes
  from jsonb_array_elements_text(coalesce(v_req->'accreditation_any_of', '[]'::jsonb)) as s;
  if array_length(v_schemes, 1) is not null then
    if not exists (
      select 1 from public.subcontractor_accreditations a
      where a.subcontractor_id = p_subcontractor_id
        and a.scheme = any(v_schemes)
        and (a.expiry_date is null or a.expiry_date >= current_date)
    ) then
      v_failures := v_failures || ('accreditation:any_of:' || array_to_string(v_schemes, '|'));
    end if;
  end if;

  -- An APPROVED, current RAMS (generic or job-specific).
  if coalesce((v_req->>'rams_required')::boolean, false) then
    if not exists (
      select 1 from public.subcontractor_rams r
      where r.subcontractor_id = p_subcontractor_id
        and r.approval_status = 'approved'
        and (r.valid_until is null or r.valid_until >= current_date)
    ) then
      -- ::text matters — an untyped literal on the right of text[] || gets
      -- parsed as an array literal and fails (caught by the live smoke test).
      v_failures := v_failures || 'rams:approved_required'::text;
    end if;
  end if;

  return jsonb_build_object(
    'compliant', coalesce(array_length(v_failures, 1), 0) = 0,
    'failures', to_jsonb(v_failures)
  );
end;
$$;

revoke all on function public.subcontractor_compliance_status(uuid) from public, anon;
grant execute on function public.subcontractor_compliance_status(uuid) to authenticated;

-- ── 7. Job override columns + the dispatch gate ────────────────────────

alter table public.jobs add column if not exists subcontractor_override_reason text;
alter table public.jobs add column if not exists subcontractor_override_by uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists subcontractor_override_at timestamptz;

-- SECURITY DEFINER: the evaluator must see compliance rows regardless of the
-- caller's RLS context. Fires ONLY when a subcontractor is being assigned
-- (insert with subcontractor_id, or update changing it) — every other job
-- write path is untouched. Service-role writes (auth.uid() null) bypass.
create or replace function public.fos_enforce_subcontractor_compliance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb;
  v_role text;
begin
  if new.subcontractor_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.subcontractor_id is not distinct from old.subcontractor_id then
    return new;
  end if;
  if auth.uid() is null then
    return new; -- service-role / system write
  end if;

  v_status := public.subcontractor_compliance_status(new.subcontractor_id);
  if (v_status->>'compliant')::boolean then
    return new;
  end if;

  -- Non-compliant: allow only an org-admin override WITH a recorded reason.
  select role into v_role from public.profiles where id = auth.uid();
  if v_role in ('org_admin', 'super_admin')
     and new.subcontractor_override_reason is not null
     and btrim(new.subcontractor_override_reason) <> '' then
    new.subcontractor_override_by := auth.uid();
    new.subcontractor_override_at := now();
    return new;
  end if;

  raise exception 'subcontractor_not_compliant: %',
    array_to_string(array(select jsonb_array_elements_text(v_status->'failures')), ', ')
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_jobs_subcontractor_gate on public.jobs;
create trigger trg_jobs_subcontractor_gate
  before insert or update of subcontractor_id, subcontractor_override_reason on public.jobs
  for each row execute function public.fos_enforce_subcontractor_compliance();

comment on function public.fos_enforce_subcontractor_compliance() is
  'Dispatch gate: blocks assigning a job to a subcontractor failing the org compliance matrix (insurance/accreditation/RAMS) unless an org admin records an override reason. No-ops on null subcontractor_id and service-role writes.';
