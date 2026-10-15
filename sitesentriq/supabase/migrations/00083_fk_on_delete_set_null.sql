-- 00083_fk_on_delete_set_null.sql
--
-- C11 (iter 12 data-integrity audit). Three parent-delete buttons in the app
-- (useDeleteArea, useDeleteSubcontractor, useDeleteSupplier) hit child FKs left
-- at the default ON DELETE NO ACTION, so deleting a parent that had children
-- threw an opaque Postgres FK error and the delete silently failed.
--
-- 00041 cascaded the main client→property→asset→job tree but missed these three.
-- For the two NULLABLE child columns the correct behaviour is SET NULL (detach
-- the child, keep it) — an asset shouldn't vanish because its area was deleted,
-- and a historical job shouldn't vanish because a subcontractor was removed; the
-- job just becomes unassigned. (subcontractor_documents already CASCADEs, which
-- is correct — a sub's own documents go with it.)
--
-- suppliers.purchase_orders.supplier_id is NOT NULL so SET NULL is impossible and
-- CASCADE would delete financial records — blocking is the right behaviour there,
-- so that one is handled with a friendly client-side message instead (see
-- use-purchase-orders.ts), not changed here.

alter table public.assets drop constraint if exists assets_area_id_fkey;
alter table public.assets
  add constraint assets_area_id_fkey
  foreign key (area_id) references public.areas(id) on delete set null;

alter table public.jobs drop constraint if exists jobs_subcontractor_id_fkey;
alter table public.jobs
  add constraint jobs_subcontractor_id_fkey
  foreign key (subcontractor_id) references public.subcontractors(id) on delete set null;
