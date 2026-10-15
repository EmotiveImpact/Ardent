# @haumea/ui

Shared UI primitives consumed by `apps/web` (and the future
`apps/marketing` if/when it splits out).

**Web-only**. The components wrap HeroUI v3 + Lucide React, both of
which are React DOM. Mobile uses its own primitives until a React
Native port arrives — when that happens, this package can split into
`@haumea/ui-web` + `@haumea/ui-mobile` or grow native exports.

## Exports

  SearchInput     — search field with icon + clear button
  FilterSelect    — list-page filter dropdown
  TableCheckbox   — row-select primitive (HeroUI Checkbox + indeterminate)
  Wordmark        — brand lockup (H mark + HAUMEA text)
