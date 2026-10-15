-- 00037_organisations_insert_policy.sql — fix new-user signup
--
-- Bug: lisanking@gmail.com signed up but their auto-create-org call was
-- silently blocked by RLS. The organisations table has SELECT and UPDATE
-- policies but NO INSERT policy, so the implicit DENY blocked it.
--
-- Fix: allow any authenticated user to insert a new organisation. The
-- subsequent profiles UPDATE links the new org to their profile (the
-- existing profiles_update_own policy permits self-edit).
--
-- This is the standard self-serve SaaS pattern: each user can spawn one
-- org for themselves on first login. We don't gate by "user has no org
-- yet" at the DB level because RLS can't easily check the inserter's
-- profile state in a CHECK clause without recursion — the client-side
-- !profileData.organisation_id guard in auth-context handles intent;
-- the worst case (a malicious user creating extra orgs) just litters
-- their own profile with unused records.

CREATE POLICY "organisations_insert_authenticated"
ON public.organisations
FOR INSERT
TO authenticated
WITH CHECK (true);
