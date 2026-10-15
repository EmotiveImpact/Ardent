# Demo Data Seed — Haumea / SiteSentriq

Seeded into Supabase project `vphjwvleffuwwgbjxups` (EmotiveImpact's Project, eu-west-2)
on 2026-06-07 to exercise every feature of the web dashboard and the field-engineer mobile app.

All demo rows are marked with a `[DEMO]` text prefix and/or use fixed UUID prefixes
(`11111111…` engineer, `22222222…` clients, `33333333…` properties, `44444444…` assets,
`55555555…` compliance, `66666666…` jobs, `77777777…` service reports, `88888888…` time
entries, `99999999…` notes, `aaaa0000…` actions, `bbbb0000…` engineer locations,
`cccc0000…` quotes, `dddd0000…` quote lines, `eeee0000…` invoices, `ffff0000…` invoice lines).

## Identity used (the account the user logs in as)

- **Organisation:** `SiteSentriq test` — `9a616592-254a-48f4-8104-47c8f698b999`
- **Profile / auth user (web + mobile login):** Augustus Edem — `emotiveimpact@gmail.com`
  — profile id `24df9e59-f612-4040-8d4c-48616bbdd72c`
- **Engineer record created:** `[DEMO] Augustus Edem` — engineers.id
  `11111111-0000-4000-8000-000000000001`, `profile_id` = the auth user above.

### How mobile job assignment works (important)
`engineer_assignments.engineer_id` has a **foreign key to `profiles`**, not `engineers`.
The mobile app (`apps/mobile/hooks/useJobs.ts`) matches assignments against
`[auth.user.id, engineers.id]`. Because the FK only accepts a profile id, all demo jobs
are assigned via the **profile id** `24df9e59-f612-4040-8d4c-48616bbdd72c`, which is exactly
`auth.user.id` for this account — so they appear in the mobile Today / Schedule tabs.
(The attempt to also assign the `engineers.id` was rejected by the FK and is unnecessary.)

## What was seeded (counts per table)

| Table | Count | Notes |
|---|---|---|
| engineers | 1 | demo engineer tied to the user's profile |
| clients | 3 | Northgate Retail Group, Riverside Care Homes, Meridian Office Park |
| properties | 6 | 2 per client, with addresses + lat/lng + region |
| assets | 8 | HVAC / Fire / Electrical / Lifts / Mechanical, varied status |
| compliance_items | 8 | 3 overdue, 3 due_soon, 2 compliant — next_due spread around today |
| jobs | 14 | 3 today, 2 in_progress, 4 upcoming, 3 completed, 1 failed_access, 1 revisit |
| engineer_assignments | 14 | one per demo job → user's profile id |
| service_reports | 3 | for the 3 completed jobs (pass/pass/fail) |
| time_entries | 5 | travel + on_site across the completed jobs (kind ∈ travel/on_site) |
| notes | 2 | on completed jobs |
| actions | 4 | open defects, priority low/medium/high |
| engineer_locations | 2 | on_site + travelling, recorded in last few minutes (web Engineer Tracker) |
| quotes | 3 | draft / sent / approved (totals set directly on the quote rows) |
| invoices | 3 | paid / sent / overdue (subject to pooler-outage verification — see below) |

## Tables intentionally SKIPPED

- **quote_lines** — SKIPPED. A pre-existing **bug** blocks all inserts: the trigger
  `recalculate_quote_totals` calls `public.fos_recalculate_quote_totals()`, which is defined
  with `search_path = ''` but references `quotes` / `quote_lines` **unqualified**, so every
  `quote_lines` insert throws `relation "quotes" does not exist`. This affects the real app
  too, not just the seed. The 3 demo quotes still carry correct `subtotal/tax/total` values,
  so they display fine without line items. Fix: schema-qualify the table names inside
  `fos_recalculate_quote_totals` and `fos_quote_lines_after_change` (the `set_quote_line_totals`
  trigger fn). Not done here — task is INSERT-only, no schema/function changes.
- **invoice_lines** — NOT attempted after the quote_lines trigger bug surfaced and the SQL
  pooler began timing out; invoice rows carry their own totals so they render. Can be added
  later once the pooler is stable (no known trigger bug on invoice_lines).
- Many empty feature tables (documents, contracts, certificates, risk_assessments, job_photos,
  stock_items, purchase_orders, etc.) were left untouched — out of scope for the requested
  demo surface and several have ambiguous required FKs.

## NOTE on the seeding run

The Supabase **SQL pooler** started returning `Connection terminated due to connection
timeout` partway through (the project itself is `ACTIVE_HEALTHY` — it's a transient pooler
issue). All inserts up to and including **engineer_locations** were verified committed.
The **invoices** insert was submitted but its confirmation `SELECT` could not be read back
before the pooler outage. Re-run the idempotent invoices block below if the verification
query shows fewer than 3 — every block is guarded with `WHERE NOT EXISTS`, so re-running is safe.

### Idempotent invoices re-run (safe to run anytime)
```sql
INSERT INTO invoices (id, organisation_id, client_id, property_id, invoice_number, status, subtotal, tax, total, due_date, notes, created_by)
SELECT v.id,'9a616592-254a-48f4-8104-47c8f698b999', v.client, v.prop, v.inv, v.status, v.sub, v.tax, v.total, v.due, v.notes,'24df9e59-f612-4040-8d4c-48616bbdd72c'
FROM (VALUES
 ('eeee0000-0000-4000-8000-000000000001'::uuid,'22222222-0000-4000-8000-000000000001'::uuid,'33333333-0000-4000-8000-000000000001'::uuid,'[DEMO] INV-2026-001','paid', 150.00, 30.00, 180.00, (now()-interval '10 days')::date,'[DEMO] Emergency lighting monthly test'),
 ('eeee0000-0000-4000-8000-000000000002'::uuid,'22222222-0000-4000-8000-000000000003'::uuid,'33333333-0000-4000-8000-000000000005'::uuid,'[DEMO] INV-2026-002','sent', 360.00, 72.00, 432.00, (now()+interval '20 days')::date,'[DEMO] Chiller quarterly PPM'),
 ('eeee0000-0000-4000-8000-000000000003'::uuid,'22222222-0000-4000-8000-000000000002'::uuid,'33333333-0000-4000-8000-000000000003'::uuid,'[DEMO] INV-2026-003','overdue', 600.00, 120.00, 720.00, (now()-interval '5 days')::date,'[DEMO] Emergency lift callout')
) AS v(id,client,prop,inv,status,sub,tax,total,due,notes)
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE invoices.id=v.id);
```

## Delete ALL demo data later (single snippet)

Run top-to-bottom (children before parents). Safe — only touches `[DEMO]` rows / demo UUID prefixes.

```sql
BEGIN;

-- children of jobs
DELETE FROM time_entries      WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE '[DEMO]%');
DELETE FROM service_reports   WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE '[DEMO]%');
DELETE FROM notes             WHERE content LIKE '[DEMO]%';
DELETE FROM engineer_assignments WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE '[DEMO]%');
DELETE FROM engineer_locations   WHERE id::text LIKE 'bbbb0000%';
DELETE FROM actions           WHERE title LIKE '[DEMO]%';

-- billing
DELETE FROM invoice_lines     WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE '[DEMO]%');
DELETE FROM invoices          WHERE invoice_number LIKE '[DEMO]%';
DELETE FROM quote_lines       WHERE quote_id IN (SELECT id FROM quotes WHERE quote_number LIKE '[DEMO]%');
DELETE FROM quotes            WHERE quote_number LIKE '[DEMO]%';

-- core
DELETE FROM jobs              WHERE title LIKE '[DEMO]%';
DELETE FROM compliance_items  WHERE name LIKE '[DEMO]%';
DELETE FROM assets            WHERE name LIKE '[DEMO]%';
DELETE FROM properties        WHERE name LIKE '[DEMO]%';
DELETE FROM clients           WHERE name LIKE '[DEMO]%';
DELETE FROM engineers         WHERE id = '11111111-0000-4000-8000-000000000001';

COMMIT;
```
