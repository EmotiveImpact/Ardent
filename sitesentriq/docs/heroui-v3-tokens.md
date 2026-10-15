# HeroUI v3 semantic tokens — usage guide

This codebase wires HeroUI v3's semantic CSS variables alongside its existing
internal palette (`brand-*`, `navy-*`, `status-*`, `surface-*`, `border-*`,
`text-*`). All five themes (`light`, `dark`, `midnight`, `glass`, `luxe`) define
the v3 tokens, so HeroUI components and any new code that reads `var(--accent)`
etc. will automatically follow the active theme.

## Why two systems coexist

The internal tokens (`--color-brand-500`, `--color-text-primary`, …) are still
the source of truth for the existing component library — sidebar, dashboards,
tables, and a thousand `bg-surface-card` / `text-text-primary` utility classes.
The v3 tokens (`--accent`, `--foreground`, …) sit on top so that:

1. HeroUI v3 components (Button, Input, Modal, Alert, …) pick up the right
   colours via their built-in CSS without any per-instance overrides.
2. New components can be written against the v3 surface (`bg-accent`,
   `text-foreground`) and stay portable — they don't have to know about our
   internal palette names.
3. Themes are switched in one place (`src/contexts/theme-context.tsx`) and both
   layers update together.

## The full token surface

Every theme defines these. Tokens with a `-foreground` suffix are the
correctly-contrasted text colour for content placed on the matching background.

### Backgrounds & surfaces

| Token | Meaning |
| --- | --- |
| `--background` | Page background (lowest layer). |
| `--foreground` | Default text colour on `--background`. |
| `--surface` | Card / panel background (one level above page). |
| `--surface-foreground` | Default text colour on `--surface`. |
| `--overlay` | Popover / menu / dropdown background (above surface). |
| `--overlay-foreground` | Default text colour on `--overlay`. |
| `--default` | Neutral chip / tag background. |
| `--default-foreground` | Default text colour on `--default`. |

### Brand / accent

| Token | Meaning |
| --- | --- |
| `--accent` | Primary brand colour (orange, mapped to `--color-brand-500`). |
| `--accent-foreground` | Text on `--accent` (white). |
| `--accent-soft` | Tinted accent background — subtle highlights, hover states. |
| `--accent-soft-foreground` | Text on `--accent-soft`. |

### Status

| Token | Meaning |
| --- | --- |
| `--success` / `--success-foreground` | Compliant / passing. |
| `--warning` / `--warning-foreground` | Due soon. |
| `--danger` / `--danger-foreground` | Overdue / failed. |

### Form fields

| Token | Meaning |
| --- | --- |
| `--field-background` | Input / select / textarea background. |
| `--field-foreground` | Input text colour. |
| `--field-placeholder` | Placeholder text. |
| `--field-border` | Default field border. |

### Structural

| Token | Meaning |
| --- | --- |
| `--border` | Default border colour for cards, dividers. |
| `--separator` | Thin separator (rules between rows, etc.). |
| `--muted` | Muted background tint. |
| `--muted-foreground` | Muted body text. |
| `--focus` | Focus ring colour. |
| `--link` | Hyperlink colour. |
| `--backdrop` | Modal / drawer scrim. |
| `--scrollbar` | Scrollbar thumb colour. |

### Constants (theme-invariant)

| Token | Meaning |
| --- | --- |
| `--white`, `--black`, `--snow`, `--eclipse` | Fixed colours that stay the same across all themes. |

## How to use them in new components

Tailwind v4 reads CSS custom properties directly from `@theme`, so you can use
them as Tailwind colour names without configuring anything:

```tsx
// New component — uses HeroUI v3 surface tokens
<button
  type="button"
  className="bg-accent text-accent-foreground hover:bg-accent/90 px-4 py-2 rounded-lg"
>
  Save changes
</button>

// Card on a panel
<div className="bg-surface text-surface-foreground border border-border rounded-xl p-6">
  …
</div>
```

For plain `<button>` elements that need Button-like styling without using the
HeroUI `<Button>` component, prefer the `buttonVariants()` helper from
`@heroui/styles` — it produces the same class output the Button component would
generate, so the two stay visually consistent.

```tsx
import { buttonVariants } from '@heroui/styles'

<a className={buttonVariants({ color: 'primary', variant: 'solid' })} href="/x">
  Open
</a>
```

## Mapping from internal tokens → v3 tokens

When porting an existing component, this table is the cheat sheet:

| Internal token | HeroUI v3 token |
| --- | --- |
| `--color-surface-page` | `--background` |
| `--color-surface-card` | `--surface` |
| `--color-surface-elevated` | `--overlay` |
| `--color-text-primary` | `--foreground` / `--surface-foreground` |
| `--color-text-secondary` | `--muted-foreground` |
| `--color-text-muted` | `--muted` |
| `--color-brand-500` | `--accent` |
| `--color-brand-100` (light) / `--color-brand-950` (dark) | `--accent-soft` |
| `--color-status-compliant` | `--success` |
| `--color-status-due-soon` | `--warning` |
| `--color-status-overdue` | `--danger` |
| `--color-border-default` | `--border` |
| `--color-border-strong` | (no direct v3 equivalent — keep using internal) |

Internal tokens are not deprecated. Prefer them where they exist; reach for the
v3 tokens for new HeroUI surfaces or shared primitives that should look right in
isolation (the marketing site, the unauthenticated tenant invite flow, …).

## Theme switching

`src/contexts/theme-context.tsx` keeps three things in sync on every theme change:

1. `class` — `light` or `dark` (HeroUI ships some class-prefixed CSS).
2. `data-theme` — one of `light`, `dark`, `midnight`, `glass`, `luxe`.
3. `theme-{id}` class — for any bespoke selectors elsewhere in the app.

A separate effect watches `prefers-reduced-motion: reduce` and sets
`data-reduce-motion="true"` on the `<html>` element when the user has motion
disabled at the OS level. HeroUI v3 honours this automatically; the bespoke
keyframe animations in `src/index.css` (scale-in, fade-in, slide-in, bell-ring,
status-pulse) honour it via a global `@media (prefers-reduced-motion: reduce)`
rule plus a `:root[data-reduce-motion="true"]` rule covering programmatic opt-in.

## HMR caveat for `@theme`

Tailwind v4's `@theme` block is not always reliably hot-reloaded by Vite — if
you edit `src/index.css` and the new colours don't appear in the dev server,
**restart the dev server** (`Ctrl+C` then `npm run dev`). The production build
(`npm run build`) does not have this issue.

## What is NOT migrated yet (deferred to v15.1)

- HeroUI v3 compound-component patterns (e.g. `<Alert.Icon /><Alert.Content />`)
  are not adopted across the existing components. The `Button`, `Card`, `Input`,
  etc. usage already matches v3's prop API, so this is a stylistic refactor
  rather than a breaking change.
- `tv()` / `tailwind-variants` adoption for bespoke variants — still done with
  `clsx` in most places. Migration is per-component as files are touched.
- Replacing `class-variance-authority` patterns (none currently in use).
