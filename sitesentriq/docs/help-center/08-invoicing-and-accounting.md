---
title: Invoicing & accounting sync
description: Raise invoices, push them to Xero or QuickBooks, and see exactly what synced — with a retry when it doesn't.
---

# Invoicing & accounting sync

## Raising invoices

Create invoices with line items, generate a **PDF**, record **payments**, and send
**payment reminders** by email. You can also build an invoice from logged time entries,
and convert a quote into a job and then invoice it.

## Pushing to your accounting system

SiteSentriq connects to **Xero** and **QuickBooks Online** (and **Stripe** for card
payments). Connect them in Settings, then push an invoice from the invoice page.

## Seeing what actually synced

Broken or silent accounting sync is the most common complaint about other field-service
tools — so SiteSentriq makes it visible. Each invoice has an **Accounting sync** panel
showing:

- The current status — *Pushed*, *Pushing…*, or *Sync error*.
- For a failure, **the exact provider error** (e.g. "Xero: token expired"), not a generic
  message.
- The full **push history** for that invoice.
- A **Retry push** button.

## Stuck pushes recover themselves

If a push crashes halfway (it gets stuck on *Pushing…*), the system treats it as abandoned
after 10 minutes and lets you retry — so an invoice never wedges in limbo forever.

## Tip

If you connect both Xero and QuickBooks, an invoice pushes to the provider you've set as
auto-push; you can also push manually from the invoice page at any time.
