import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup the DOM and unmount React trees between tests so RTL's `render`
// doesn't leak state into sibling tests.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia — many HeroUI / framer-motion / Tailwind
// utilities call it during render, so provide a no-op shim.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// IntersectionObserver — used by Recharts/HeroUI tooltips.
class MockIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  // @ts-expect-error — assigning a minimal shim
  globalThis.IntersectionObserver = MockIntersectionObserver
}

// ResizeObserver — used by Recharts ResponsiveContainer.
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  // @ts-expect-error — assigning a minimal shim
  globalThis.ResizeObserver = MockResizeObserver
}

// Radix Select/Dropdown use Pointer Capture + scrollIntoView, which jsdom
// doesn't implement. Shim them so components rendering these primitives
// (FormSelect / FilterSelect / Dropdown) don't throw in tests.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false)
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn()
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn()
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
}

// URL.createObjectURL / revokeObjectURL — used by exportToCsv etc.
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:mock-url'),
  })
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn(),
  })
}

// Force placeholder Supabase env for tests — overrides anything from `.env`
// so the auth-context's DEV_MODE branch is exercised deterministically.
process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'placeholder-key'

// Mirror onto import.meta.env (Vite already populated it by the time setup runs).
if (typeof import.meta !== 'undefined' && import.meta.env) {
  ;(import.meta.env as Record<string, string>).VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
  ;(import.meta.env as Record<string, string>).VITE_SUPABASE_ANON_KEY = 'placeholder-key'
}
