import { useRef, useEffect, useState, useCallback } from 'react'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  onClear: () => void
  width?: number
  height?: number
  label?: string
}

export function SignaturePad({
  onSave,
  onClear,
  width,
  height = 200,
  label = 'Sign here',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // The 2D context is already scaled by devicePixelRatio in setupCanvas, so
      // it draws in CSS-pixel space. Map the pointer offset into THAT space by
      // dividing the backing-store size by dpr first — otherwise dpr is applied
      // twice and the ink lands at dpr× the finger position (garbled / off-canvas
      // on every HiDPI touch device, which is exactly where signatures are taken).
      const dpr = window.devicePixelRatio || 1
      const scaleX = canvas.width / dpr / rect.width
      const scaleY = canvas.height / dpr / rect.height

      if ('touches' in e) {
        const touch = e.touches[0]
        if (!touch) return null
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        }
      }

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    },
    []
  )

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = width || container.clientWidth
    const displayHeight = height

    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#1a1a2e'
  }, [width, height])

  useEffect(() => {
    setupCanvas()

    // Re-setup reassigns canvas.width/height, which WIPES the drawing. Only do it
    // when the display width actually changes — otherwise spurious resize events
    // (scrollbars, devtools, mobile URL-bar show/hide) erased a half-drawn signature.
    let lastWidth = (width || containerRef.current?.clientWidth) ?? 0
    const handleResize = () => {
      const w = (width || containerRef.current?.clientWidth) ?? 0
      if (w === lastWidth) return
      lastWidth = w
      setupCanvas()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setupCanvas, width])

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const point = getCanvasPoint(e)
    if (!point) return

    setIsDrawing(true)
    setHasDrawn(true)
    lastPoint.current = point

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return

    const point = getCanvasPoint(e)
    if (!point || !lastPoint.current) return

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    lastPoint.current = point
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    lastPoint.current = null
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onClear()
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return

    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div ref={containerRef} className="w-full">
      {label && (
        <p className="mb-2 text-sm font-medium text-text-secondary">{label}</p>
      )}
      <div className="relative rounded-lg border border-border-default bg-surface-card overflow-hidden">
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-text-muted text-sm">Sign here</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-lg border border-border-default bg-surface-card hover:bg-surface-page px-4 py-2 text-sm font-medium text-text-secondary transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDrawn}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Signature
        </button>
      </div>
    </div>
  )
}

export default SignaturePad
