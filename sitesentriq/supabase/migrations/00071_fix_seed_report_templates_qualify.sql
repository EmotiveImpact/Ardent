-- 00071_fix_seed_report_templates_qualify.sql
--
-- Continues the 00070 fix down the call chain. seed_default_report_templates()
-- also has `search_path TO ''` (00058 hardening) but references the
-- `report_templates` table UNQUALIFIED in three places (one INSERT, two
-- EXISTS sub-selects), so it threw "relation report_templates does not exist"
-- once the trigger could finally reach it. Schema-qualify all three to
-- public.report_templates; keep the locked empty search_path. Body is
-- otherwise byte-for-byte the deployed version.

create or replace function public.seed_default_report_templates(p_org_id uuid)
returns void
language plpgsql
set search_path to ''
as $function$
DECLARE
  templates jsonb := '[
    {
      "name": "Compliance overdue by client",
      "description": "Every compliance item past its next-due date, grouped by client.",
      "dataset": "compliance_items",
      "definition": {
        "filters": [ { "field": "status", "operator": "equals", "value": "overdue" } ],
        "columns": [ "name", "compliance_type", "next_due", "status", "property_id" ],
        "sort": [ { "field": "next_due", "direction": "asc" } ],
        "group": ["property_id"]
      }
    },
    {
      "name": "Engineer utilisation last 30 days",
      "description": "Jobs completed by engineer in the last 30 days.",
      "dataset": "jobs",
      "definition": {
        "filters": [
          { "field": "status", "operator": "equals", "value": "completed" },
          { "field": "completed_date", "operator": "after", "value": "now-30d" }
        ],
        "columns": [ "title", "scheduled_date", "completed_date", "status", "priority" ],
        "sort": [ { "field": "completed_date", "direction": "desc" } ],
        "group": []
      }
    },
    {
      "name": "Invoice ageing report",
      "description": "Outstanding invoices ordered by due date — oldest first.",
      "dataset": "invoices",
      "definition": {
        "filters": [ { "field": "status", "operator": "in", "value": "sent,overdue,partially_paid" } ],
        "columns": [ "invoice_number", "client_id", "total", "due_date", "status" ],
        "sort": [ { "field": "due_date", "direction": "asc" } ],
        "group": []
      }
    },
    {
      "name": "Job completion rate by category",
      "description": "All jobs in the last 90 days with their completion status.",
      "dataset": "jobs",
      "definition": {
        "filters": [ { "field": "scheduled_date", "operator": "after", "value": "now-90d" } ],
        "columns": [ "title", "status", "priority", "scheduled_date", "completed_date" ],
        "sort": [ { "field": "scheduled_date", "direction": "desc" } ],
        "group": ["status"]
      }
    },
    {
      "name": "PPM due in next 30 days",
      "description": "Maintenance plans with next-due date inside the next 30 days.",
      "dataset": "maintenance_plans",
      "definition": {
        "filters": [
          { "field": "is_active", "operator": "equals", "value": "true" },
          { "field": "next_due", "operator": "before", "value": "now+30d" }
        ],
        "columns": [ "name", "frequency", "next_due", "last_completed", "is_active" ],
        "sort": [ { "field": "next_due", "direction": "asc" } ],
        "group": []
      }
    }
  ]'::jsonb;
  t jsonb;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(templates) LOOP
    INSERT INTO public.report_templates
      (organisation_id, name, description, dataset, definition, is_org_wide, is_system, created_by_user_id)
    SELECT
      p_org_id,
      t->>'name',
      t->>'description',
      t->>'dataset',
      t->'definition',
      true,
      true,
      NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM public.report_templates
      WHERE organisation_id = p_org_id
        AND name = t->>'name'
        AND is_system = true
    );
  END LOOP;
END;
$function$;
