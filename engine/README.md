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

It opens on the Manchester demo firm from Core's mock data, with its busy
day moved to today. Delete `.data/ardent.json` to start fresh.

To run the engine and Ardent Core together, Core reading the engine, use
`scripts/dev.sh` from the repo root. Without an engine, Core and Field run
this same engine inside the app on the demo firm (`src/connect.ts`), which is
what the published prototypes do.

## What's in it

| File | What it does |
| --- | --- |
| `src/engine.ts` | Records and rules. `engine.as({ userId, orgId })` gives that person the same `ArdentClient` both apps already use, plus firm admin |
| `src/store.ts` | Where records are kept: memory, or memory saved to a file |
| `src/server.ts` | The engine over HTTP for Core and Field: `POST /api/rpc`, `GET /api/me` |
| `src/http-client.ts` | `ArdentClient` over HTTP |
| `src/connect.ts` | The one connection both apps use: a running engine, or the engine in the app on the demo firm |
| `kit/` | The design kit both apps share: colours, type, state labels and tones, number and time formats. `npm run kit` writes `kit/ardent.css` |
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

Email and password, checked against a salted hash. Signing in gives a token
that lasts 30 days; the apps send it as `Authorization: Bearer`. Demo
sign-ins, all with the password `ardent-demo`: `dan@` (owner), `jo@`
(office), `kofi@`, `ryan@`, `tom@demo.ardent.local` (field). The server
listens on this machine only unless `ARDENT_PUBLIC=1`, and has no HTTPS yet.

## Where it came from

The tenancy model (a firm on every record, rules checked in one place) and the
customer, site and job records are adapted from Haumea.

## Next

1. Field offline: Haumea's save queue and photo upload, tested with no signal.
2. One real job end to end across both apps.
3. Sending quotes and invoices for real (email and a card payment link).
4. A real database (Neon) and hosting, when Edem says go.
