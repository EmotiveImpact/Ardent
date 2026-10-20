# Ardent engine

The one backend under every Ardent product. Ardent Core (the office) and
Ardent Field (the engineer's phone) both read and write these records, and
later industries ("Ardent for Property" and so on) are the same engine set up
differently.

It's plain TypeScript with no outside services. Records live in memory and
are saved to a JSON file. A real database (most likely Neon, which is
Postgres) replaces the file later, behind the same `Store` shape, without the
apps changing.

## Run it

Needs Node 22.6 or newer.

```sh
cd engine
npm install
npm test        # rules, tenancy and a job end to end, over HTTP too
npm start       # http://127.0.0.1:8787, data in engine/.data/ardent.json
```

It opens on the Manchester demo firm from Core's mock data. Delete
`.data/ardent.json` to start fresh.

## What's in it

| File | What it does |
| --- | --- |
| `src/engine.ts` | Records and rules. `engine.as({ userId, orgId })` gives that person the same `ArdentClient` both apps already use, plus firm admin |
| `src/store.ts` | Where records are kept: memory, or memory saved to a file |
| `src/server.ts` | The engine over HTTP for Core and Field: `POST /api/rpc`, `GET /api/me` |
| `src/http-client.ts` | `ArdentClient` over HTTP, for the apps to swap in for the mock |
| `src/seed.ts` | The demo firm, built from `core/src/data/mock.ts` |

The records are the shapes in `core/src/data/model.ts`, which stays the
contract. Core owns it; change it there first.

## Who sees what

Every record belongs to one firm. Anything outside your firm reads as not
found, so nothing leaks about other firms.

| Role | Who | Sees | Changes |
| --- | --- | --- | --- |
| `owner` | Runs the firm | Everything in the firm | Everything, plus who's in the firm (never their own role) |
| `office` | Dispatch, admin, accounts | Everything in the firm | Jobs, crew state, lines, checks, invoices and payments |
| `field` | Engineers and subbies | Only jobs they're on, plus those jobs' customers and sites, and the crew list | Job progress (booked to complete), lines and checks until invoiced, their own time, photos, notes and signatures, their own state, and invoicing and payment on their own jobs |

Removing someone from the firm cuts their access at once; their crew record
and history stay.

## Sign-in

Not built yet. For now the caller names themselves with an `x-ardent-user`
header, which is only safe on your own machine, so the server only listens on
localhost. Demo sign-ins: `dan@` (owner), `jo@` (office), `kofi@`, `ryan@`,
`tom@demo.ardent.local` (field).

## Where it came from

The tenancy model (a firm on every record, rules checked in one place) and the
customer, site and job records are adapted from Haumea.

## Next

1. Sign-in, then Core and Field switched from mock data to this engine.
2. Field offline: Haumea's save queue, and photo upload to Ardent storage.
3. One real job end to end, with no signal on site.
4. Customers, sites and quotes created from Core (the shared client only reads them today).
5. A real database (Neon) and hosting, when Edem says go.
