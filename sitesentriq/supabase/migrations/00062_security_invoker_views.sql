-- 00062_security_invoker_views.sql
--
-- Ensure read-only convenience views execute with invoker permissions so RLS
-- on the underlying tables is applied. audit_log_view also carries explicit
-- organisation_id filters in each UNION branch as defence in depth.

create or replace view public.audit_log_view
with (security_invoker = true)
as
select
  te.id::text                       as id,
  te.organisation_id                as organisation_id,
  te.user_id                        as actor_user_id,
  p.email                           as actor_email,
  te.event_type                     as action,
  case
    when te.job_id is not null      then 'job'
    when te.property_id is not null then 'property'
    when te.client_id is not null   then 'client'
    else 'timeline'
  end                               as entity_type,
  coalesce(
    te.job_id::text,
    te.property_id::text,
    te.client_id::text
  )                                 as entity_id,
  te.description                    as summary,
  te.metadata                       as metadata,
  null::text                        as ip_address,
  null::text                        as user_agent,
  'info'::text                      as severity,
  'timeline_events'::text           as source,
  te.created_at                     as created_at
from public.timeline_events te
left join public.profiles p on p.id = te.user_id
where te.organisation_id = public.organisation_id()

union all

select
  sae.id::text                       as id,
  sae.organisation_id                as organisation_id,
  sae.actor_user_id                  as actor_user_id,
  coalesce(sae.actor_email, p.email) as actor_email,
  sae.action                         as action,
  sae.entity_type                    as entity_type,
  sae.entity_id                      as entity_id,
  sae.summary                        as summary,
  sae.metadata                       as metadata,
  sae.ip_address                     as ip_address,
  sae.user_agent                     as user_agent,
  sae.severity                       as severity,
  'system_audit_events'::text        as source,
  sae.created_at                     as created_at
from public.system_audit_events sae
left join public.profiles p on p.id = sae.actor_user_id
where sae.organisation_id = public.organisation_id()

union all

select
  spl.id::text                      as id,
  spl.org_id                        as organisation_id,
  null::uuid                        as actor_user_id,
  spl.email                         as actor_email,
  ('sso.' || spl.action)            as action,
  'sso'::text                       as entity_type,
  spl.domain                        as entity_id,
  case spl.action
    when 'provisioned'    then 'JIT-provisioned ' || spl.email || ' (' || spl.provider || ')'
    when 'already_member' then 'SSO sign-in by ' || spl.email
    when 'blocked'        then 'SSO sign-in blocked for ' || spl.email
    when 'no_mapping'     then 'No domain mapping for ' || spl.email
    when 'error'          then 'SSO error for ' || spl.email
    else 'SSO event for ' || spl.email
  end                               as summary,
  jsonb_build_object(
    'provider',      spl.provider,
    'domain',        spl.domain,
    'error_message', spl.error_message
  )                                 as metadata,
  null::text                        as ip_address,
  null::text                        as user_agent,
  case
    when spl.action in ('blocked', 'error') then 'warning'
    else 'info'
  end                               as severity,
  'sso_provisioning_log'::text      as source,
  spl.created_at                    as created_at
from public.sso_provisioning_log spl
where spl.org_id is not null
  and spl.org_id = public.organisation_id()

union all

select
  asl.id::text                      as id,
  asl.organisation_id               as organisation_id,
  null::uuid                        as actor_user_id,
  null::text                        as actor_email,
  ('accounting.' || asl.action)     as action,
  'invoice'::text                   as entity_type,
  asl.invoice_id::text              as entity_id,
  case asl.action
    when 'connect'         then 'Connected ' || asl.provider
    when 'disconnect'      then 'Disconnected ' || asl.provider
    when 'push_invoice'    then 'Pushed invoice to ' || asl.provider || coalesce(' (' || asl.external_id || ')', '')
    when 'refresh_token'   then 'Refreshed ' || asl.provider || ' token'
    else asl.provider || ' ' || asl.action
  end                               as summary,
  jsonb_build_object(
    'provider',    asl.provider,
    'status',      asl.status,
    'external_id', asl.external_id,
    'error',       asl.error
  )                                 as metadata,
  null::text                        as ip_address,
  null::text                        as user_agent,
  case
    when asl.status = 'error' then 'warning'
    else 'info'
  end                               as severity,
  'accounting_sync_log'::text       as source,
  asl.created_at                    as created_at
from public.accounting_sync_log asl
where asl.organisation_id = public.organisation_id();

alter view public.audit_log_view set (security_invoker = true);

comment on view public.audit_log_view is
  'Org-wide audit log surface. UNIONs timeline_events, system_audit_events, sso_provisioning_log and accounting_sync_log. Read in the UI through src/lib/audit/queries.ts; gated to org_admin/super_admin/auditor by the audit:read permission.';

create or replace view public.low_stock_view
with (security_invoker = true)
as
select
  id,
  organisation_id,
  sku,
  name,
  category,
  current_qty,
  reorder_point,
  reorder_qty,
  unit,
  location,
  supplier_name
from public.stock_items
where archived = false
  and current_qty <= reorder_point;

alter view public.low_stock_view set (security_invoker = true);
