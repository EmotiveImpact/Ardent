-- 00087 — Allow clients to save accounting-integration SETTINGS.
--
-- xero_connections / quickbooks_connections (00019) had RLS enabled with ONLY a
-- FOR SELECT policy. The integration settings pages do a client-side
-- `.update(...)` to persist non-secret settings (auto_push, default tax/account
-- refs). With no FOR UPDATE policy that update matched ZERO rows and returned no
-- error, so "Save Settings" showed a success toast but nothing persisted (the
-- form reverted on reload).
--
-- Add org-scoped FOR UPDATE policies, mirroring the slack_notification_settings
-- precedent (00028). OAuth token columns are only ever written by the service-
-- role edge functions; the client app only sends settings columns.

CREATE POLICY "xero_connections_update" ON public.xero_connections FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "quickbooks_connections_update" ON public.quickbooks_connections FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
