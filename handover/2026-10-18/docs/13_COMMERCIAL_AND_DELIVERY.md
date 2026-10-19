# 13. Business model, pilots and Ardent managed delivery

## Business context [CONFIRMED USER DIRECTION]

Ardent is a premium AI infrastructure and technology company for real businesses. Trade businesses are an initial profitable vertical, especially plumbing/heating, electrical, building services and other operational companies. Buyers may prefer a fully deployed solution to maintaining software themselves. The service business is a feature: Ardent maps operations, integrates systems, trains staff, manages the platform, measures impact and continues improving it. Do not present it as a bargain CRM SaaS product with arbitrary silver/gold/platinum upsells.

## Offer architecture [PROPOSED]

**Ardent Core / Operations:** a subscription to dependable field + office operational software, configured by industry and role.  
**Ardent Deployed:** discovery, data migration, integrations, workflow configuration, AI agent provisioning, training and managed go-live.  
**Ardent Embedded:** custom workflows, technical lead/forward-deployed engineering, governance and long-term platform optimisation.  
**Ardent Voice / Agents:** usage-aware add-on or bundled outcome-based service for approved automation, with transparent provider cost and limitations.  
**Ardent Compute / Private:** bespoke hosting/compute/security for clients needing it, not a blanket default for plumbing firms.

Avoid separate codebases for every package. Services can use the same audited platform with configuration, adapters and optional custom modules.

## Pricing hypothesis (not validated, do not publish as final)

Previous strategy discussion proposed exploratory price bands: Core roughly **£299–£999/month**, Deployed roughly **£2,500–£10,000 setup plus £750–£2,500/month**, Embedded bespoke **£15,000+ setup and £3,000+/month**. These are example willingness-to-pay hypotheses, NOT market-verified prices or approved tariffs. Voice costs, call minutes, model usage, messages, mapping, payments, support SLA, storage, compliance/legal costs and delivery staff require a fully loaded margin model before offering customers.

For early customers consider high-touch deployment so the team observes workflows and proves the value. Avoid trying to close hundreds of low-usage accounts before the product spine is robust.

## First ICP and pilot criteria

**Pilot focus:** three UK plumbing/heating or adjacent operational firms, ideally 5–30 vans, at least one office/dispatcher, a measurable quote/invoice backlog, existing software/data to migrate or integrate, and owners willing to share baseline process metrics. Mix recurring maintenance and reactive emergency work to test both workflows. Do not claim recruitment or signed pilots unless verified.

**Selection criteria:** genuine operational pain, owner access, engineer buy-in, enough weekly job volume to test, accountable data controller and willingness to pilot without inappropriate reliance on unfinished AI safety features.

## Pilot offer and implementation playbook

1. **Discovery:** observe calls, dispatch, field day, quote approval, accounting and complaint flow. Map current tech stack and data ownership.
2. **Baseline:** missed enquiries, admin hours, quote cycle, unbilled completions, payment lag, satisfaction, provider spend and typical gross margin.
3. **Data plan:** create safe tenant, permission matrix, import/mapping plan and rollback path. Avoid live production secrets in demos.
4. **Minimum vertical slice:** one real job end-to-end with offline field evidence and accurate office invoice statuses.
5. **Training:** owner (exception dashboard), office (enquiry/dispatch and money), engineer (next job and evidence), finance (review/reconcile). Short scenario-based sessions.
6. **Shadow operations:** run parallel with old system for defined period when appropriate, reconcile discrepancies daily; no silent double billing.
7. **Controlled go-live:** limited users/jobs first, support channel, incident handling and success metrics.
8. **Review:** weekly quantitative and qualitative check, prioritised fixes, customer decision to expand.
9. **Expansion:** Voice, agents and automation only after core data reliability, permissions and human approvals proven.
10. **Operational partnership:** monitoring, configuration, periodic process review and measured improvement.

## Sales narrative

**Before Ardent:** missed calls, scattered notes, engineer paperwork, uncertain job profit, invoicing delays and office chasing.  
**With Ardent:** jobs captured, properly assigned, documented once, ready to invoice and easy to understand, with explicit accountable automation.

Do not promise zero admin, autonomous compliance, guaranteed revenue gain or a live feature that is still simulated. Demonstrate the exact workflow using a realistic customer story rather than generic 'AI will revolutionise your business'.

## Packaging and trust

- Transparent deployment responsibility, provider usage and support.
- Clear data ownership/export and no opportunistic lock-in.
- Distinguish software subscription, managed support and custom engineering.
- Written approval boundaries for automated calls/messages, payment actions, provider account changes and certificate production.
- Product access by useful business needs rather than arbitrary seat paywalls that defeat field adoption (commercial hypothesis; validate economics).

## Unit economics / operating model questions

What is the real cost per inbound voice minute? What percentage of calls needs a human? How much engineer onboarding per site? Which API integrations require expensive vendor contracts? How many support hours for 20-van customer? Can product gross margin support Deployed/Embedded staffing? What failure/support response time is contractually promised? What is the acquisition path: direct sales, trade association/referrals, accounting partners, distributor channel? Record answers from pilot, don't invent them.

## Strategic growth

Stage 1 prove trades operation. Stage 2 expand to multi-trade, maintenance and property portfolio work. Stage 3 reuse Ardent's voice/agent/orchestration/compute toolkit with selected customers outside trades. This protects the broader AI infrastructure thesis while funding it through concrete, repeatable products and managed deployments.
