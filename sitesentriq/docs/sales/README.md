# Sales Playbook — SiteSentriq (UK FM)

This folder is the operating manual for finding, talking to, and converting the first paying customers of SiteSentriq. It is intentionally **not** in the product roadmap — these are sales/distribution artefacts, not feature specs.

**Created:** 2026-05-16
**Owner:** Augustus Edem, Emotive Impact
**Status of product at time of writing:** v0.20.1 — shipped, deployed, tested. Differentiators live: Continuous Compliance Score, public Trust URL, Statement of Compliance PDFs, ICS calendar feed.
**Status of distribution:** zero customer conversations to date. This folder fixes that.

---

## The honest situation

The product is technically excellent for an FM CMMS at this stage of life. 245 build tasks completed across 24 phases. Real test coverage. Live differentiators no UK competitor has. But:

- No specific first customer is lined up.
- No FM operator has touched the product.
- "v1.0.0 = first paying customer" is therefore a circular definition right now — you can't get more ready for a customer you haven't met.

The next sprint is not features. It's **5 conversations with UK FM operators** that will tell us whether we built what they want — and what we'd need to change if not.

Once 5 conversations are done, *everything* downstream gets easier:
- Pricing has a basis.
- The roadmap has a target.
- The board-session audit (in `~/.claude/skills/board-session/`) has a frame for "is this ready *for whom*?"
- Marketing copy writes itself from real prospect language.

This folder is the toolkit to make those 5 conversations happen.

---

## How to use these documents (in order)

1. **`outreach/target-finding-playbook.md`** — Find 20 qualified UK FM operators worth contacting. Roughly 2-3 hours of LinkedIn / Companies House / trade-body work.

2. **`outreach/message-templates.md`** — Send the cold-outreach messages. Aim for 20 sent → 4-8 replies → 2-4 calls booked. (Realistic conversion for a first-time cold campaign in this industry.)

3. **`discovery/interview-guide.md`** — Run the 30-minute discovery call. The 7 questions are designed to probe whether we built what they want, not to pitch them. **No demo in call one.** Discovery first.

4. **`narrative/one-page-narrative.md`** — When a prospect from call one says "show me", send this as a 1-pager and book call two.

5. **`narrative/demo-script.md`** — Run the 20-minute demo on call two. Structured walkthrough of dashboard → trust URL → job lifecycle → statement PDF → pricing.

---

## The numbers to hit (realistic)

For one round of customer development:

| Step | Target |
|---|---|
| Operators identified | 20 |
| Cold messages sent | 20 |
| Replies (any kind) | 4-8 |
| Discovery calls booked | 2-4 |
| Discovery calls completed | 2-4 |
| Demos given | 1-3 |
| Paying customers | 0-2 (and that's OK for round one — the goal of round one is learning, not revenue) |

If you finish round one with 5 completed discovery calls and zero customers — **that is still a win**, because you now know what the next round needs.

If you finish round one with 5 completed discovery calls and one paying customer — that's a real validated market hypothesis.

If you finish round one with zero completed discovery calls — re-read the outreach templates, change the angle, try again. Don't go back to building.

---

## The discipline

Three rules that protect this work from collapsing back into feature-building:

1. **Five before conclusions.** Don't decide anything based on a single prospect's reaction. One operator's "no" might be another's "yes". Need a sample.
2. **Verbatim notes.** Capture exact phrases. Don't paraphrase. The phrases are how you'll re-write the website and the pitch.
3. **No new features until 5 calls done.** Tempting to "just add this one thing they mentioned". Resist. Wait for the pattern, then build to the pattern.

---

## When this is done

After round one (5 calls):

- Update `PROGRESS.md` with a "Phase 25 — Customer discovery round 1" entry.
- Create `docs/sales/findings/round-1.md` summarising what you learned.
- Re-read `narrative/one-page-narrative.md` and rewrite it using the operators' own language.
- THEN run the board-session skill in `audit-only` mode with the now-real v1.0.0 question.

Then round two.
