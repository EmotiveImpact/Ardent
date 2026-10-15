// Sprint 1.5 / H2 — Lightweight client-side image compression.
//
// Why this exists:
//   The site portal photo upload (raise-callout) and the client portal
//   photo flow both accept up to 4 photos at 8 MB each. Modern phone
//   cameras shoot 12-megapixel JPEGs that comfortably push 6-8 MB. A
//   site lead reporting a leak from a basement on a flaky 3G connection
//   would happily wait for one ~400 KB upload — they will not wait for
//   four × 7 MB. The result is silently abandoned uploads.
//
// What this is:
//   A pure helper that decodes a File via createImageBitmap (honors
//   EXIF orientation natively in Chrome/Safari/Firefox 2019+), draws it
//   onto a canvas at a capped size, and re-encodes as JPEG. Returns a
//   new File with the same name but a deterministic .jpg extension.
//
// What this is NOT:
//   Not a HEIC decoder — Safari can read HEIC via createImageBitmap,
//   other browsers will reject it and we fall back to the raw file. Not
//   a worker — single-threaded is fine for ≤4 sequential photos.

export interface CompressOptions {
  /** Max long-edge in pixels. Default 1920 — plenty for triage photos. */
  maxEdge?: number
  /** JPEG quality 0..1. Default 0.85 — sweet spot for phone-camera JPEGs. */
  quality?: number
  /** Skip work entirely if the file is already smaller than this. Default 500 KB. */
  skipUnderBytes?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 1920,
  quality: 0.85,
  skipUnderBytes: 500 * 1024,
}

/**
 * Compress an image file. Returns the original File when:
 *   - the input isn't an image
 *   - the input is already under `skipUnderBytes`
 *   - decoding fails (HEIC on a non-Safari browser, corrupted JPEG, etc.)
 *
 * Never throws — call sites can treat the return value as "best effort".
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const { maxEdge, quality, skipUnderBytes } = { ...DEFAULTS, ...opts }

  if (!file.type.startsWith('image/')) return file
  if (file.size <= skipUnderBytes) return file

  let bitmap: ImageBitmap
  try {
    // imageOrientation: 'from-image' is the modern default and rotates
    // EXIF-rotated photos so they appear right-side-up. Without it,
    // iPhone landscape photos render sideways on canvas.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) return file

    // If our "compressed" output is somehow larger than the original
    // (rare but possible for tiny PNG icons), fall back to the original.
    if (blob.size >= file.size) return file

    // Replace any extension on the original name with .jpg — the bytes
    // are JPEG now regardless of what the source claimed.
    const baseName = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    // Free the GPU/CPU-backed image data as soon as we're done.
    bitmap.close()
  }
}
