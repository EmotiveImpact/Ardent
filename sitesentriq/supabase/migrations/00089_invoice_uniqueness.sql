-- 00089_invoice_uniqueness.sql
--
-- Data-integrity backstop for the duplicate-invoice bug (WEB_REVIEW.md #2):
-- a converted quote's "Draft Invoice" button could be pressed repeatedly,
-- creating multiple invoices that all share `INV-{quote_number}` because
-- `invoices.invoice_number` had no unique constraint. The app layer now guards
-- this (useConvertQuoteToInvoice is idempotent on quote_id + the UI shows
-- "View Invoice" when one exists), but the DB should enforce it too.
--
-- Verified before applying: 0 existing rows violate either index (no duplicate
-- (organisation_id, invoice_number) pairs and no quote_id with >1 invoice), so
-- these create cleanly with no de-dup needed.

-- Invoice numbers are unique within an organisation.
create unique index if not exists invoices_org_number_unique
  on public.invoices (organisation_id, invoice_number);

-- At most one invoice per source quote — the precise guard for the bug above.
-- Partial: manually-created invoices (quote_id IS NULL) are unconstrained.
create unique index if not exists invoices_one_per_quote
  on public.invoices (quote_id)
  where quote_id is not null;
