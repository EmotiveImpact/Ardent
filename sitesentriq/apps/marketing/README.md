# haumea-marketing

The Haumea marketing site — separate Vite app, separate deploy.

Routes:
  /             home
  /features     feature breakdown
  /pricing      per-seat plans
  /about        the people + story
  /contact      demo form

## Run

  npm run dev:marketing       # from workspace root
  cd apps/marketing && npm run dev

Dev server runs on port 5175 (apps/web is on 5174 — both can run
side by side).

## Build / deploy

  npm run --workspace=haumea-marketing build

Output goes to `apps/marketing/dist/`. Deploy as its own Vercel
project with:

  - Root Directory: apps/marketing
  - Build Command: npm run build (or `npm run --workspace=haumea-marketing build` from repo root)
  - Output Directory: dist
  - Install Command: cd ../.. && npm install

## Shared packages

  @haumea/ui    — Wordmark, SearchInput, FilterSelect, TableCheckbox
  @haumea/utils — formatDate, cn, formatCurrency, etc.
