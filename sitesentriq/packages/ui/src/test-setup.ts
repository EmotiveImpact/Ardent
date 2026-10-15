import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Tear down rendered trees between tests so RTL's `render` doesn't leak
// state into sibling tests. Same convention as apps/web/src/test/setup.ts.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia. Several of our primitives sit
// downstream of HeroUI / framer-motion utilities that call it during
// render, so provide a no-op shim to mirror apps/web's test harness.
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
