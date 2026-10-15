// src/lib/sso/sso-buttons.tsx
//
// Two-button row used above the email/password form on the login &
// register pages. Provider glyphs are inline SVGs so we don't pull
// in any new dependencies (lucide doesn't ship Microsoft / Google
// brand marks).

import { useState } from 'react'
import { signInWithSso, type SsoProvider } from './providers'

function MicrosoftGlyph() {
  // Four-square Microsoft logo — official brand quadrants.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      role="img"
    >
      <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
      <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
      <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
      <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
    </svg>
  )
}

function GoogleGlyph() {
  // Multi-stroke "G" — Google brand mark.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 48 48"
      aria-hidden="true"
      role="img"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.2 35.3 44 30 44 24c0-1.34-.14-2.65-.4-3.5z"
      />
    </svg>
  )
}

interface ProviderButtonProps {
  provider: SsoProvider
  label: string
  onError: (msg: string) => void
}

function ProviderButton({ provider, label, onError }: ProviderButtonProps) {
  const [loading, setLoading] = useState(false)
  const handleClick = async () => {
    setLoading(true)
    const { error } = await signInWithSso(provider)
    if (error) {
      setLoading(false)
      onError(error.message)
    }
    // Success path is a redirect — nothing more to do here.
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-card hover:bg-surface-page text-text-primary text-label font-medium px-3 py-2.5 transition-colors disabled:opacity-50"
    >
      {provider === 'azure' ? <MicrosoftGlyph /> : <GoogleGlyph />}
      <span>{loading ? 'Redirecting…' : label}</span>
    </button>
  )
}

interface SsoButtonsProps {
  onError?: (msg: string) => void
}

export function SsoButtons({ onError }: SsoButtonsProps) {
  const [localError, setLocalError] = useState('')
  const handleErr = (msg: string) => {
    setLocalError(msg)
    onError?.(msg)
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <ProviderButton
          provider="azure"
          label="Microsoft"
          onError={handleErr}
        />
        <ProviderButton
          provider="google"
          label="Google"
          onError={handleErr}
        />
      </div>
      {localError && (
        <p className="text-status-overdue text-caption">{localError}</p>
      )}
    </div>
  )
}

export function SsoDivider() {
  return (
    <div className="flex items-center gap-3 my-4" role="separator">
      <div className="flex-1 h-px bg-border-default" />
      <span className="text-micro uppercase tracking-wider text-text-muted">
        or
      </span>
      <div className="flex-1 h-px bg-border-default" />
    </div>
  )
}
