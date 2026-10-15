-- ============================================================
-- Migration 00011: Web Push notification subscriptions
-- One row per browser/device per user. The `endpoint` from the
-- PushSubscription is unique across the web, so we key on that.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user
  ON notification_subscriptions(user_id);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own push subscriptions.
DROP POLICY IF EXISTS "users manage own push subscriptions"
  ON notification_subscriptions;
CREATE POLICY "users manage own push subscriptions"
  ON notification_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role (edge function) needs to read across users to fan out push.
-- Service role bypasses RLS by default; no extra policy needed.
