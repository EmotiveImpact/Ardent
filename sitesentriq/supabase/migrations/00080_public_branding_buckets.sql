-- 00080_public_branding_buckets.sql
--
-- N5 fix. 00059 privatized ALL storage buckets, including org-logos and
-- avatars. But those are low-sensitivity BRANDING assets that are embedded in
-- contexts with no auth session — statement/tender PDFs, transactional emails,
-- and the public client portal — where a short-lived signed URL would expire
-- and break. So `getPublicUrl` on them currently 403s (broken images).
--
-- Make ONLY these two buckets public-read again. WRITES remain locked to the
-- org-prefix RLS policies (org_logos_tenant_rw / avatars_tenant_rw), so this
-- only opens READ. The genuinely sensitive buckets (job-photos, documents,
-- engineer-documents, certificates, statements) stay private + signed.

update storage.buckets set public = true where id in ('org-logos', 'avatars');
