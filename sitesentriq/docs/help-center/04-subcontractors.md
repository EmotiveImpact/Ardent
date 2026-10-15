---
title: Subcontractors & compliance gating
description: Record subcontractor insurance, accreditations and RAMS, set what's required, and block non-compliant assignments. Plus no-login work links.
---

# Subcontractors & compliance gating

SiteSentriq won't let you send a job to a subcontractor who isn't compliant — the check
is built into job assignment, not just a reminder.

## 1. Set what "compliant" means (once)

Go to **Settings → Subcontractor compliance**. Choose:

- Which **insurance** types are mandatory (e.g. public liability, employers' liability).
- Which **accreditation** schemes you accept — they need at least one (SSIP, CHAS,
  SafeContractor, Constructionline, NICEIC, Gas Safe…).
- Whether an approved, in-date **RAMS** is required.

Save. This becomes your organisation's rule. (If you never set it, a sensible UK default
applies: public-liability insurance + one SSIP-family accreditation + RAMS required.)

## 2. Record what each subcontractor holds

Open a subcontractor → **Compliance** tab:

- **Insurance policies** — type, insurer, policy number, expiry.
- **Accreditations** — scheme, reference, expiry.
- **RAMS** — title, validity; a manager **approves** or **rejects** each one.

A banner at the top shows **Compliant** or **Not compliant**, and lists exactly what's
missing or expired.

## 3. The gate (assigning work)

On a **job**, the *Subcontractor* panel lets you assign one. The panel shows a live
compliance badge for whoever you pick.

- If they're **compliant**, assignment goes through.
- If they're **not**, the assignment is **blocked**. An **org admin** can override, but
  must type a reason — which is recorded on the job (who overrode it, when, and why).

This is enforced in the database, so it can't be bypassed through the API either.

## 4. Expiry radar

The subcontractors list shows a banner of **insurance/accreditation expiring in the next
30 days (or already lapsed)**, so you can chase renewals before they block work.

## 5. No-login work links

For a subcontractor doing one job, you don't need to give them an account:

1. On the job's *Subcontractor* panel, click **Generate work link** (it copies a URL).
2. Send it to them (text, email, WhatsApp).
3. They open it and walk a simple stepper: **Accept → upload RAMS → add photos →
   sign → mark complete.**
4. When they submit, the job moves to **contractor review** and your ops team is notified.

Files they upload (RAMS, certs, photos) are stored securely and are **downloadable by
your staff** from the subcontractor's Compliance tab and the job. The link is for one job
only, expires after 14 days, and you can **revoke** it any time.
