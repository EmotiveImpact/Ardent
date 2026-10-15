-- Allow the compliance score's "open critical action" signal to match
-- real actions. The scoring function already filters actions.priority =
-- 'critical'; the original constraint predated that semantic tier.

alter table public.actions
  drop constraint if exists actions_priority_check;

alter table public.actions
  add constraint actions_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent', 'critical'));
