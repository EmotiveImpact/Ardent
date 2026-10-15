---
title: Building Information Pack export
description: Export a complete, current record of a building in one click — the golden-thread handover document.
---

# Building Information Pack export

The **Building Information Pack** is a one-click export of everything you hold about a
building — the "golden thread" handover record the Building Safety Act expects.

## How to export

1. Open a **property**.
2. Click **Export building pack** in the header.
3. You get a download link to the pack (it opens in a new tab).

## What's in it

A single, self-contained document covering the building's current record:

- **Property & responsible persons** — address, site manager, access, regions
- **Asset register** — every asset, make/model/serial, install date, status
- **Compliance** — items + statuses, and completed certificates
- **Document register** — with full **version chains** (v3 → v2 → v1)
- **Planned maintenance** — the PPM regimes for the building
- **Job history** — work carried out
- **RAMS** — contractor risk assessments & method statements
- **Permits to work**
- **Risk assessments** and **log book** entries
- **Timeline** and **audit** slices

## Two formats

- A **human-readable HTML pack** — open it, print it, hand it over.
- A **machine-readable JSON manifest** (`haumea.building_pack` schema) — for data
  portability: a successor duty-holder or another system can ingest the building's record
  without re-keying it.

## Why it matters

Under the Building Safety Act, duty holders must be able to hand over a structured digital
record of a building. This is that — produced on demand from your live data, not assembled
by hand. It's also a clean answer to "can we get our data out?" — the manifest is a
full-fidelity export.
