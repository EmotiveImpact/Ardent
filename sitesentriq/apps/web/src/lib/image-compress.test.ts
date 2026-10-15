// Sprint 1.5 / H2 — Tests for compressImage early-exit guards.
//
// We can't easily exercise the real canvas/JPEG round-trip in jsdom, but
// the early-exit branches (non-image, already-small, decode failure) are
// the safety net that ensures we never block a user upload on a flaky
// image — those are exactly the paths worth locking down.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './image-compress'

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Allocate a Blob of the requested size so File.size is meaningful.
  // Using a Uint8Array avoids string-encoding surprises.
  const data = new Uint8Array(sizeBytes)
  return new File([data], name, { type })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('compressImage early-exit guards', () => {
  it('returns the original file when the type is not an image', async () => {
    const file = makeFile('contract.pdf', 'application/pdf', 2_000_000)
    const out = await compressImage(file)
    expect(out).toBe(file)
  })

  it('returns the original file when already under skipUnderBytes', async () => {
    const file = makeFile('icon.png', 'image/png', 100_000) // 100 KB
    const out = await compressImage(file)
    expect(out).toBe(file)
  })

  it('honors a custom skipUnderBytes threshold', async () => {
    const file = makeFile('thumb.jpg', 'image/jpeg', 600_000) // 600 KB
    // With default 500 KB threshold this would attempt to compress; with
    // a 1 MB threshold it should skip.
    const out = await compressImage(file, { skipUnderBytes: 1_000_000 })
    expect(out).toBe(file)
  })

  it('returns the original file when createImageBitmap throws', async () => {
    const file = makeFile('weird.heic', 'image/heic', 5_000_000)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('cannot decode HEIC')
      }),
    )
    const out = await compressImage(file)
    expect(out).toBe(file)
  })

  it('passes imageOrientation: from-image to honor EXIF rotation', async () => {
    // We just need to verify the call shape — the bitmap then "fails"
    // to draw (no canvas in jsdom anyway) and we return the original.
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000)
    const spy = vi.fn(async () => {
      throw new Error('test short-circuit')
    })
    vi.stubGlobal('createImageBitmap', spy)
    await compressImage(file)
    expect(spy).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
  })

  it('returns the original file when canvas 2d context is unavailable', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000)
    const fakeBitmap = {
      width: 4032,
      height: 3024,
      close: vi.fn(),
    }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap))
    // jsdom canvas has no 2d context — getContext returns null. Verify
    // we surface that as a graceful fallback to the original file rather
    // than throwing.
    const out = await compressImage(file)
    expect(out).toBe(file)
    expect(fakeBitmap.close).toHaveBeenCalled()
  })
})
