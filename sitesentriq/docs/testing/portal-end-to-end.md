# Portal end-to-end smoke test

Run this before any prospect demo, before any release that touches `/portal/*`, `/site/*`, or anything in `apps/web/src/components/layout/portal-layout.tsx` / `site-layout.tsx`. Catches the class of bug that broke us between v0.20.0 and v0.21.4 — the portal flow looking correct in code but the live cross-tenant story being subtly broken.

**Time to run:** ~10 minutes manual, plus 2 minutes for the multi-tenancy check at the end.

**You'll need:** the live URL (https://sitesentriq-web.vercel.app or wherever), three throwaway email addresses you can receive mail at (Gmail "+" aliases work fine — e.g. `you+demo1@gmail.com`, `you+demo2@gmail.com`, `you+demo3@gmail.com`), two browsers OR two profiles in one browser (one regular + one incognito).

---

## Phase 1 — Fresh org creation (60 sec)

Open an **incognito window**. Go to `/register`. Sign up:

- Email: `you+demo-fm@gmail.com`
- Full name: `Demo FM Manager`
- Company: `Demo FM Ltd`
- Password: 12+ chars with lower + upper + digit (e.g. `Test1234abcd`)

**Verify:**
- [ ] The confirmation-email step shows up.
- [ ] Click the email link → lands on `/onboarding` (NOT `/dashboard`). This is the v0.20.1 fix.
- [ ] Wizard shows 6 steps (Welcome / Client / Property / Asset / Compliance item / PPM). This is the v0.21.1 compliance-item step.
- [ ] Complete the wizard with a real-looking client + property + asset + compliance item + PPM plan.
- [ ] Lands on `/dashboard` with the org name "Demo FM Ltd" in the top-left.

**Confirm via DB** (run in Supabase SQL Editor or via MCP):
```sql
select o.id, o.name, count(p.id) as users
from public.organisations o
join public.profiles p on p.organisation_id = o.id
where o.name = 'Demo FM Ltd'
group by o.id, o.name;
```
Expect 1 row, 1 user. The user is the new tenant's only org_admin.

---

## Phase 2 — Invite a portal user (90 sec)

Stay logged in as the FM operator from Phase 1. Go to a client's detail page (`/dashboard/clients/<id>`).

- [ ] There's an "Invite portal user" / "Invite contact" button (in the client header or contacts panel).
- [ ] Submit invite with email `you+demo-client@gmail.com`, name "Demo Client Admin", role `client_admin`, scope: all properties for this client.

**Verify the invite arrived:**
- [ ] Check the inbox — there's an invite email with a "Set up your account" link.
- [ ] Click the link in a **second browser window** (so the FM operator stays logged in in window 1).
- [ ] Lands on `/site/accept-invite?token=...` (or `/portal/accept-invite` depending on scope).
- [ ] Set password.
- [ ] Lands on `/portal` (NOT `/dashboard` — the v0.20.0 board flagged this routing bug).

**Confirm via DB:**
```sql
select pc.user_id, pc.property_id, pc.status, p.email, p.role
from public.property_contacts pc
join public.profiles p on p.id = pc.user_id
where p.email = 'you+demo-client@gmail.com';
```
Expect 1+ rows, status='active'. The invited user is in `property_contacts`, not org-level admin.

---

## Phase 3 — Raise a call-out from the portal (2 min)

As the portal user (window 2), still on `/portal`:

- [ ] Click "Raise call-out" / navigate to `/portal/raise-call-out`.
- [ ] Select the property. Category: "Plumbing". Priority: "High".
- [ ] **Verify SLA text shows live values** from the FM operator's `sla_policies`, NOT the placeholder. If the org has no policy for the priority, the fallback shows ("1 business day" for high). This is v0.21.4 Fix #3.
- [ ] Description: at least 20 chars (the High-priority Zod minimum).
- [ ] Upload 1 photo.
- [ ] Submit.

**Verify on the portal side:**
- [ ] Toast: "Call-out raised — reference #..."
- [ ] Redirects to `/portal/actions?new=<job_id>` — the new call-out is highlighted.

**Switch to window 1 (FM operator). WITHOUT REFRESHING:**
- [ ] Within ~3 seconds, a notification toast/bell appears in the topbar.
- [ ] Click the bell — see "New portal call-out at <property>". This is the v0.21.4 Fix #1 (realtime in PortalLayout now mounts RealtimeProvider).
- [ ] Click into the job — it's there with status 'scheduled', photo attached, the engineer's eventual workflow ready.

**Verify the email landed** at `you+demo-fm@gmail.com`:
- [ ] Inbox shows "New portal call-out at <property>" (via `send-email` edge function — v0.21.4 Fix #4).
- [ ] Email contains the job reference, property name, and description.

**Confirm via DB:**
```sql
select j.id, j.title, j.status, j.created_at, j.organisation_id, j.client_id
from public.jobs j
order by j.created_at desc limit 1;

select * from public.timeline_events
where event_type = 'action.raised'
order by created_at desc limit 1;
```

---

## Phase 4 — Quote approval triggers job creation (2 min)

As the FM operator (window 1):

- [ ] Go to `/dashboard/quotes/new`. Create a quote for the demo client + property. Send it (status: 'sent').

As the portal user (window 2):
- [ ] Go to `/portal/quotes`. The "sent" quote is in the "Pending" tab.
- [ ] Click "Approve".

**Verify in window 1 (FM operator):**
- [ ] Without refreshing — a notification toast appears within ~3 seconds.
- [ ] Within 5 seconds, **a new job exists** in `/dashboard/jobs` that was auto-created from the quote. This is v0.21.4 Fix #2 (`useConvertQuoteToJob` is now called on portal approval).
- [ ] The quote status flipped from 'approved' to 'converted'.

**Confirm via DB:**
```sql
select q.quote_number, q.status, j.id as job_id, j.title
from public.quotes q
left join public.jobs j on j.client_id = q.client_id
  and j.created_at >= q.updated_at - interval '5 seconds'
order by q.updated_at desc limit 1;
```

---

## Phase 5 — Multi-tenancy isolation check (2 min)

**Crucial — this is what protects you in a security review.**

Open a **third browser window** (or another incognito). Go to `/register`. Sign up with a completely different email:
- Email: `you+demo-other@gmail.com`
- Company: `Other FM Co`

Complete the wizard with minimal data (1 client, 1 property, 1 asset, etc.). Land on `/dashboard`.

**Verify:**
- [ ] You see your OWN client "Other FM Co" content — 1 client, 1 property, etc.
- [ ] You see **ZERO** of the "Demo FM Ltd" data from Phase 1 — no "Demo Client", no jobs, no quotes, nothing.
- [ ] Open `/dashboard/audit`. You see ONLY events from "Other FM Co" — no events from "Demo FM Ltd". This is the v0.21.0 security_invoker fix for `audit_log_view`.

**Then go back to window 1 (the original FM operator):**
- [ ] Refresh `/dashboard`. The new "Other FM Co" client/property does NOT appear. Your data is unchanged. Cross-tenant isolation is enforced at the DB layer.

**Confirm via DB (admin view — shows the reality across all tenants):**
```sql
select o.name, count(distinct c.id) as clients, count(distinct j.id) as jobs
from public.organisations o
left join public.clients c on c.organisation_id = o.id
left join public.jobs j on j.organisation_id = o.id
where o.name in ('Demo FM Ltd', 'Other FM Co')
group by o.name;
```
Expect two rows. The Demo FM Ltd has the data from Phases 1–4. Other FM Co has only its tiny set. Neither org sees the other's data through any user-scoped query.

---

## Cleanup

After the smoke test passes, you can delete the throwaway accounts:

```sql
-- Run as service_role
delete from public.system_audit_events
  where actor_user_id in (
    select id from auth.users where email like 'you+demo-%@gmail.com'
  );
delete from public.profiles
  where id in (select id from auth.users where email like 'you+demo-%@gmail.com');
delete from auth.users where email like 'you+demo-%@gmail.com';
delete from public.organisations
  where name in ('Demo FM Ltd', 'Other FM Co');
```

(Adapt the SQL if you used a different naming pattern.)

---

## What to do when something breaks

If any checkbox fails, that's the bug. Capture:
1. Which phase + which checkbox.
2. The HTTP status of the relevant fetch (from devtools Network tab).
3. The browser console error (if any).
4. The Supabase edge function logs (`get_logs` via MCP, or the Supabase Dashboard → Logs).

The most common failure modes and what they mean:

| Failure | Probable cause |
|---|---|
| Phase 1: confirmation link lands on `/login` not `/onboarding` | `emailRedirectTo` regressed — check `apps/web/src/lib/auth.ts` |
| Phase 2: invite link 404s | Site-invite route missing or `tenant_property_id()` function regressed (check 00058 migration) |
| Phase 3: SLA text shows fallback for ALL priorities | `sla_policies` table empty for the org — seed via `seed_default_sla_policies(org_id)` RPC |
| Phase 3: notification toast doesn't appear in window 1 | `RealtimeProvider` regressed out of `PortalLayout` — check the v0.21.4 fix is still in place |
| Phase 3: no email arrives | Either `RESEND_API_KEY` env var unset on Vercel/Supabase, or the `send-email` function 401'd (check the auth pattern in `isServiceRoleJwt`) |
| Phase 4: quote approval doesn't create a job | `useConvertQuoteToJob` regressed out of `handleAction` in `portal/quotes.tsx` — check v0.21.4 Fix #2 |
| Phase 5: cross-tenant data leaks | One of the RLS policies regressed. Run `get_advisors(type='security')` — should be 0 ERRORs. If there's a new ERROR, that's it. |

---

## When to run this

- ✅ Before every release that touches `/portal/*`, `/site/*`, layout files, or the auth flow
- ✅ Before any prospect demo
- ✅ After applying any Supabase migration affecting RLS, auth, or storage
- ✅ Quarterly as a regression check even if nothing changed (Supabase platform drift)
- ❌ Not needed for pure UI polish releases that don't touch tenancy code
