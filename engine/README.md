# Ardent engine

The one backend under every Ardent product. Ardent Core (the office) and
Ardent Field (the engineer's phone) both read and write these records, and
later industries ("Ardent for Property" and so on) are the same engine set up
differently.

It runs on Supabase: Postgres, sign-in, file storage and an API generated from
the tables. Everything here is local for now. No hosted project exists yet.

## What's in it

| Migration | What it adds |
| --- | --- |
| `tenancy` | Organisations (one per firm), memberships with roles, J-1042 style numbering, `create_organisation()` for sign-up |
| `records` | Crew (`operators`) and their registrations, customers, sites, assets |
| `jobs` | Jobs, who's on them, lines, compliance checks, time, photos, notes, signatures, certificates |
| `security` | Row level security on every table, the field column guard, grants |

The tables follow `core/src/data/model.ts`, which stays the contract both apps
code against. Where they differ:

- A job's `lines`, `checks` and `operatorIds` are child tables (`job_lines`,
  `job_checks`, `job_operators`), so the phone can add one line without
  rewriting the job.
- `Job.start`/`end` are `starts_at`/`ends_at`, and may be empty for an enquiry.
- `Site.lat`/`lng` are real `latitude`/`longitude`.
- `Customer.balance` isn't stored; it will come from invoices.
- A certificate's state (valid, due soon, overdue, draft) is worked out from
  `issued_on` and `expires_on` when read, so it never goes stale.
- Assets are new. Core's model gets an `Asset` type when a screen needs one.
- Trades include fire, lifts and HVAC on top of the model's list.

Quotes, invoices and payments come with the quote to invoice to payment step.

## Who sees what

Every row carries `org_id`, and child rows point at parents through
`(org_id, parent_id)`, so a record can't reference another firm's data even by
mistake. On top of that, row level security:

| Role | Who | Sees | Changes |
| --- | --- | --- | --- |
| `owner` | Runs the firm | Everything in the firm | Everything, plus members and the firm's name |
| `office` | Dispatch, admin, accounts | Everything in the firm | Customers, sites, jobs, crew, certificates |
| `field` | Engineers and subbies | Only jobs they're on, plus those jobs' customers, sites, assets and certificates, and the crew list | Job progress (booked to complete) and job notes; lines and checks until invoiced; their own time, photos, notes, signatures and on-shift state |

Field limits are enforced in the database, not the apps: a field user who
tries to change a job's price, title, booking or another engineer's record is
refused. Removing someone's membership cuts their access at once, while their
crew record and history stay.

## Run the tests

Needs Postgres 15 or newer installed (`initdb`, `pg_ctl`, `psql`). No Docker.

```sh
cd engine
tests/run.sh
```

It starts a throwaway Postgres, adds the parts of Supabase the migrations rely
on (`tests/supabase-shim.sql`), applies every migration and the seed, then
runs `tests/0*.sql`: tenancy isolation, what field users can and can't do, and
a job flowing from the office to an engineer and back. CI runs the same on
every PR that touches `engine/`.

## Run it locally with Supabase

Needs Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```sh
cd engine
supabase start      # Postgres, Auth, API and Studio on localhost
supabase db reset   # re-applies migrations and the seed
```

The seed is the Manchester demo firm from Core's mock data. Sign in as
`dan@demo.ardent.local` (owner), `jo@demo.ardent.local` (office), or
`kofi@`, `ryan@` or `tom@demo.ardent.local` (field). The password for all of
them is `ardent-demo`. These accounts only exist on your machine.

## Changing things

- New schema change: add a migration in `supabase/migrations/`, named
  `YYYYMMDDHHMMSS_what.sql`. Never edit one that has shipped.
- Every new table needs `org_id`, row level security and policies in the same
  migration, plus a line in the tests. Supabase grants new tables to signed-out
  visitors by default, so revoke `anon` on each one.
- Demo data: edit `core/src/data/mock.ts` or `scripts/build-seed.ts`, then
  `node --experimental-strip-types scripts/build-seed.ts`. CI fails if
  `seed.sql` is out of date.

## Where it came from

The tenancy pattern (organisation id on every row, helper functions behind the
policies) and the customers, sites and assets hierarchy are adapted from
Haumea's schema. The changes for Ardent: people can belong to more than one
firm, ids are readable strings the phone can create offline (`job_...`), the
field role is limited to its own jobs, and Haumea's facilities-specific tables
(areas, contracts, maintenance plans) are left out until a trade needs them.

## Next

1. Sign-in and a Supabase-backed `ArdentClient`, so Core and Field read this
   database instead of mock data.
2. Field offline: Haumea's save queue and photo upload to Ardent storage.
3. One real job end to end: booked in Core, worked on the phone without
   signal, back in Core.
4. Quotes, invoices and payments.
