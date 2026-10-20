# Ardent design philosophy

Taken from the Ardent mobile app, which Edem picked as the reference look on 18 October 2026. It applies to every Ardent screen: the mobile app, Ardent Core and anything new.

## 1. Light, not lines

Screens sit on a near-black field (`bg #070707`). Depth comes from a soft light bloom behind the content and a fine film grain over everything, the way a phone looks in a dim room. Surfaces separate by shade alone: inset, surface, raised. No borders on cards, panels, buttons, chips, badges or inputs. The only lines are hairline dividers between rows of a list or table.

## 2. The screen follows the work

What the operator is doing changes how the screen feels. The bloom moves and shifts tone with the working mode (On Site warm, En Route cool steel, Off Shift low and grey). The current mode is always visible as a small chip. Status colours (green on site, blue en route, amber paused) only ever mean state, never decoration.

## 3. One accent, and it has to earn it

Ember orange (`#ff6a1a`) is the single brand colour. It marks what is live or what matters most right now: a running clock, the primary button, the selected option, a paid badge. If two things on a screen are orange, one of them is wrong.

## 4. Three voices of type

- **Michroma**, wide and uppercase, tracked out: names and moments. Mode names, screen titles (TODAY, JOB DONE, PAID), section labels in small caps.
- **Geist**: anything you read. Titles of jobs, addresses, notes, buttons.
- **Geist Mono**: every number. Times, money, job refs, postcodes, quantities, clocks. Numbers should look like instruments.

## 5. One move per screen, in the thumb zone

Each screen has one primary action, docked at the bottom where a thumb lands: Set off, Arrived, Get sign-off, Take payment. Secondary actions sit beside it in a plain fill. Nothing important hides in a menu.

## 6. Commit by holding

Anything that can't be casually undone is a press and hold: entering a mode, finishing a job, confirming sign-off. A thin bar fills in ember while you hold and drains if you let go early. It feels deliberate, and it never fires from a pocket.

## 7. Fade for hierarchy

Instead of boxes and headings, importance is set by brightness. The mode list fades away beneath the active mode. Finished jobs dim on the run sheet. Labels are faint, values are bright.

## 8. Motion is calm, wins get a moment

Content arrives with short, eased fades and slides (about 400ms), staggered down a list. The light changes slowly (about 900ms). Only real wins get a spring: the paid badge. Haptics: a light tap on selection, a firm success buzz on commit, a warning buzz when something is missing.

## 9. Say it like a tradesperson

Short, plain and British. "Set off", "Arrived", "On the tools", "Hand it over", "Couldn't get in?". No jargon from software, no exclamation marks, no em dashes.

## Tokens

Core's `core/tokens/tokens.ts` is the source: `bg #070707`, `inset #0b0b0b`, `surface #121212`, `raised #1d1d1d`, `line #1c1c1c` (row dividers only), `fg #f2f2f2`, `fgMuted #9a9a9a`, `fgFaint #5f5f5f`, `ember #ff6a1a`, status `ok #22c55e`, `warn #f59e0b`, `danger #ef4444`, `info #3b82f6`. Radius 10px for panels, 14px for large cards, pill for chips.

## Reference screens

`/mnt/project-files/mobile-app/`: 01-opening, 02-enroute, 03-today, 04-job-enroute, 05-job-onsite, 08-materials, 09 to 12 wrap-up.
