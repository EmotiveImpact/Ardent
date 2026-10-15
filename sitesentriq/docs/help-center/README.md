---
title: Help Center
description: How to use SiteSentriq — guides for the office team, field engineers, subcontractors and clients.
---

# SiteSentriq Help Center

Everything you need to run compliance, planned maintenance, jobs, contractors,
quotes, invoices and customer communication from one place.

These articles are written for the people who use the product day to day. They're
grouped by what you're trying to do.

## Who does what

- **Office / admin** — sets the rules (compliance requirements, SLA targets, permit
  flags, contracts), schedules work, raises quotes and invoices, talks to clients.
- **Field engineer** — works on the mobile app: check in, do the work, capture photos,
  signatures, parts and certificates — even with no signal.
- **Subcontractor** — gets a no-login link for a single job.
- **Client** — sees their sites, compliance, visits, quotes and invoices through the portal.

## Guides

1. [Getting started](./01-getting-started.md)
2. [Jobs & scheduling](./02-jobs-and-scheduling.md)
3. [Compliance & certificates](./03-compliance-and-certificates.md)
4. [Subcontractors & compliance gating](./04-subcontractors.md)
5. [Contracts & SLAs](./05-sla-and-contracts.md)
6. [Permits to work](./06-permits-to-work.md)
7. [Building Information Pack export](./07-building-pack.md)
8. [Invoicing & accounting sync](./08-invoicing-and-accounting.md)
9. [Dashboard & reports](./09-dashboard-and-reports.md)
10. [The engineer mobile app](./10-mobile-app.md)
11. [The client portal](./11-client-portal.md)

---

### Publishing this as a help subdomain

These files are plain Markdown with frontmatter (`title` / `description`), so they
work as-is in any docs platform. Recommended routes for `help.sitesentriq.com`:

- **Astro Starlight** or **Docusaurus** — point it at this folder, deploy to Vercel,
  add the `help` subdomain. Lightest lift; matches the existing Vite/Vercel stack.
- **Mintlify** or **GitBook** — hosted, fastest to stand up, reads this frontmatter.

Each numbered file becomes one help page; the list above becomes the sidebar.
