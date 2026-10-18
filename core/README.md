# Ardent Core

The operator's console for Ardent: jobs, crew, schedule, compliance and money for a trades business, in one dark, dense dashboard.

## Run it

```sh
cd core
npm install
npm run dev     # http://localhost:5173
npm run build   # type-checks, then builds to dist/
```

## Stack

- React 19, Vite 8, TypeScript, React Router 7
- Tailwind CSS v4, tokens in `src/index.css`
- shadcn/ui (new-york) component pattern on Radix primitives via the `radix-ui` package, in `src/components/ui`. `components.json` is set up so `npx shadcn add <component>` works when the registry is reachable.
- Geist and Geist Mono (self-hosted through Fontsource). Mono carries every number, code and postcode.
- Lucide icons

## Screens

| Route | What it shows |
| --- | --- |
| `/` | Operations: KPIs, crew on the road, compliance exceptions, live job sheet |
| `/jobs` | All jobs with status groups and search |
| `/jobs/:id` | Job sheet with customer and site |
| `/schedule` | Dispatch board, crew by hour |
| `/customers`, `/money`, `/certificates`, `/crew`, `/stock`, `/settings` | Placeholders for the next pass |

All data is mock data in `src/data/mock.ts` until the API lands.

## Shared with the mobile app

Ardent Core owns two things the mobile app builds on:

- **Data model**: `src/data/model.ts`. Money is integer pence, times are ISO 8601 in UTC, ids carry a readable prefix (`job_`, `cus_`, `eng_`), and human numbers (`J-1042`) are separate from ids.
- **Data client**: `src/data/client.ts`, the `ArdentClient` interface both apps code against. Mock-backed today; the backend will be Supabase, as in SiteSentriq.
- **Design tokens**: `tokens/tokens.ts` exports plain values (hex colours, radii, spacing, fonts, type scale) for Tailwind and React Native alike. `src/index.css` mirrors them as CSS variables. Surfaces step from `--bg` to `--surface` to `--inset` to `--raised`; `--ember` is the single brand accent; `--ok`, `--warn`, `--danger`, `--info` and `--violet` are status colours only.

Change either here first and tell the mobile app.
