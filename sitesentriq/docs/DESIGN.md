# Haumea — Design System & Philosophy

The single source of truth for **what goes where and how it looks**. If you're
adding UI, follow this. The golden rule: **never hardcode a colour, shadow, or
size — always use a token.** Tokens live in `apps/web/src/index.css` and make
every one of the app's themes (light, dark, midnight, glass, luxe…) work for free.

---

## 1. Principles

1. **Token-driven.** Colours, borders, shadows, radii and type sizes come from CSS
   custom properties / Tailwind tokens. A raw hex like `bg-[#fff]` or `text-[14px]`
   is a bug — use `bg-surface-card`, `text-body`, etc.
2. **Flat fields, floating surfaces.** Inputs are flat (border only). Cards,
   overlays and buttons carry a *subtle* shadow so they read as raised/tappable.
   Never put a shadow inside a shadow.
3. **One job per variant.** Each button/chip variant means one thing (below). Don't
   reach for a louder variant to "make it pop" — hierarchy comes from primary vs
   secondary, not from inventing styles.
4. **HeroUI v3 for controls, plain HTML for data tables.** Use HeroUI primitives
   (Button, Input, Select, Chip, Modal, Tabs…). Do **NOT** use HeroUI's `Table` —
   see §8.

---

## 2. Surfaces (backgrounds)

| Token | Light | Use |
|---|---|---|
| `surface-page` | `#f4f5f7` (soft gray) | the page background behind cards |
| `surface-card` | `#ffffff` | cards, panels, inputs, popovers, the default "thing on the page" |
| `surface-elevated` | `#f9fafb` | hover rows, nested wells, secondary fills inside a card |
| `surface-sidebar` | `#1b1f2e` (navy) | the left nav only |

Rule: **page is gray, content sits on white cards.** A bare element on the page
should almost always be inside a `bg-surface-card border border-border-default
rounded-xl` container.

## 3. Text & borders

- Text: `text-text-primary` (headings/values), `text-text-secondary` (body),
  `text-text-muted` (metadata/placeholder). `text-text-accent` for warm-orange emphasis.
- Borders: `border-border-default` (standard), `border-border-subtle` (row dividers,
  internal separators), `border-border-strong` (emphasis / input focus).

## 4. Brand, accent & status

- **Brand** = warm orange `brand-500 #e8772e`. Used for: the logo mark, active sidebar
  item, links/warm accents, and `--color-text-accent`.
- **Accent** (`--accent`) paints **primary buttons, focus rings, active toggles.** In
  the **light** theme accent is **navy `#1b1f2e`** (matches the sidebar) — so primary
  CTAs are navy in light, orange in dark. This is intentional; don't "fix" it.
- **Status** (chips, dots, KPIs): `status-compliant` (green), `status-due-soon`
  (amber), `status-overdue` (red), `status-non-compliant` (dark red). There is **no**
  `status-warning` token — use `status-due-soon` for warnings.

## 5. Typography

Use the `<Text>` / `<Heading>` / `<PageHeader>` primitives or the size tokens —
never `text-[Npx]`.

| Token | px | Use |
|---|---|---|
| `text-display` | 80 | hero numbers (compliance score) |
| `text-headline` | 28 | page titles |
| `text-title` | 20 | section / card titles |
| `text-body` | 14 | default copy |
| `text-label` | 13 | form labels, table cells |
| `text-caption` | 12 | metadata, helper text |
| `text-micro` | 11 | chip / column-header labels (usually `uppercase tracking-[0.04em]`) |

## 6. Buttons  (`<Button variant=… />` from `@heroui/react`)

| Variant | Looks | Use for |
|---|---|---|
| `primary` | filled accent (navy light / orange dark), white text | the **one** main action of a view (Save, New, Send) |
| `secondary` *(= `outline`)* | **white surface + 1px border + subtle shadow** | secondary page actions (Export, Import, Cancel, "Send reminder"). Reads as a raised button on the gray page. |
| `ghost` | transparent, fills on hover | icon-only / tertiary actions **inside a card** (row "View" eye, dropdown triggers) |
| `tertiary` | text-only, no fill | low-emphasis links inside dialogs ("Cancel" in a modal footer) |
| `danger` | red fill | destructive (Delete) |
| `soft` | tinted soft fill | de-emphasised inline accents / chips-as-buttons |

Notes:
- One `primary` per view. Everything else is `secondary`/`ghost`.
- `secondary` and `outline` now render identically (white raised) — prefer
  `secondary` in new code; `outline` is kept as an alias.
- Don't put a `ghost`/transparent button directly on the gray `surface-page` — it
  vanishes. Use `secondary` there.

## 7. Inputs & forms

- Prefer HeroUI `<TextField><Label/><Input/></TextField>`, `<TextArea>`, and the
  `FormSelect`/`FormSelectController` from `@haumea/ui`.
- **Every field is FLAT:** `bg-field` (white), `1px` `field-border`, `rounded-lg`,
  **no resting shadow**, `field-placeholder` colour, and a `--focus` ring on focus.
  HeroUI fields get this automatically; **raw native `<input>/<select>/<textarea>`
  get it too** via the base layer in `index.css` (so the two are indistinguishable).
- Labels: `text-label` / `text-caption`, `text-text-secondary`. Required = a small
  `text-status-overdue` asterisk.
- Validation: React Hook Form + Zod; show `<FieldError>` below the field.
- The flat-field decision lives in one lever: `--field-shadow` (currently `none`).
  Flip it in the theme blocks if you ever want soft-shadow fields again.

## 8. Tables

**Use plain semantic HTML** (`<table><thead><th><tbody><tr><td>`), styled with the
tokens. Do **NOT** use HeroUI's `<Table>` — its react-aria collection throws
"Found N cells and 0 columns" on cache-warm data and renders an off-colour header.
The whole app was migrated to plain tables (2026-06). Pattern:
- header row: `<th class="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">`
- body row: `<tr class="border-b border-border-subtle hover:bg-surface-page">`, cells `py-3 px-4`
- selection checkboxes: the native `TableCheckbox` from `@haumea/ui` (never a HeroUI `<Checkbox>` inside a table).
- Sortable/paginated lists: reuse `components/shared/data-table.tsx` (TanStack engine, plain HTML render).
See [internal/heroui-v3 notes] / the project memory for why.

## 9. Cards, chips, spacing

- **Card:** `bg-surface-card border border-border-default rounded-xl`. Section header
  inside: `px-5 py-4 border-b border-border-subtle`. Body padding `p-5`.
- **Chip / badge:** `<Chip variant="soft" color=…>` for status. Colour maps to the
  status tokens. `size="sm"`.
- **Radius:** `rounded-lg` (8px) for fields/buttons/small things, `rounded-xl` (12px)
  for cards/panels, `rounded-full` for pills/avatars.
- **Spacing:** vertical stacks use `space-y-5`/`space-y-6`; inline groups `gap-2`/`gap-3`.
- **Shadows:** only `--surface-shadow` (cards), `--overlay-shadow` (popovers/modals),
  and the secondary-button shadow. Fields and ghost buttons have none.

## 10. The consistency layer

Two app-wide fixes live at the bottom of `apps/web/src/index.css` (token-driven, so
they adapt per theme):
1. **Raw native fields** (`:not([data-slot])`) get the same field tokens as HeroUI
   inputs — so a hand-rolled `<input>` looks identical to a `<TextField>`.
2. **`secondary`/`outline` buttons** get a real `surface` background + border +
   `surface-shadow`, so page-level secondary actions don't disappear into the page.

If a control still looks off, the fix is almost always "use the right token /
variant from this doc," not a one-off `style=`/`[...]` value.
