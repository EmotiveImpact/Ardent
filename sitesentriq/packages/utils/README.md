# @haumea/utils

Shared helpers with no React, no Supabase client, and no env vars.
Most exports are safe in any runtime: string/date/number formatters
and the canonical `cn(...)` classname combiner.

`exportToCsv(...)` is the one browser-facing helper. It is guarded so
non-DOM runtimes such as React Native or edge functions treat it as a
no-op instead of crashing.
