// src/lib/deploy-status/types.ts
//
// Shared types for the Deploy Status DX Panel — a small dev/admin
// surface that flags failed Vercel/GitHub deploys for the latest
// commit so devs don't ship from local without knowing CI is broken.

export type DeployState =
  | 'success'
  | 'failure'
  | 'error'
  | 'pending'
  | 'in_progress'
  | 'queued'
  | 'inactive'
  | 'unknown'

export interface DeployStatus {
  /** True when the edge function has no GITHUB_TOKEN configured.
   *  UI hides the banner entirely when this is true. */
  unconfigured?: boolean
  commit_sha?: string
  state?: DeployState
  environment?: string
  target_url?: string | null
  created_at?: string
  description?: string | null
}

export type BannerPlacement = 'health' | 'dashboard' | 'dev'

/** States that should produce a loud (failure) banner. */
export const FAILURE_STATES: DeployState[] = ['failure', 'error']

/** States that should produce a soft (in-progress) banner. */
export const IN_PROGRESS_STATES: DeployState[] = ['pending', 'in_progress', 'queued']
