import { useRef, useState, useEffect, useCallback } from 'react'
import { Tooltip } from '@haumea/ui'
import {
  Pen,
  ArrowUpRight,
  Circle,
  Type,
  Eraser,
  Undo2,
  Trash2,
  Save,
  X,
  Minus,
} from 'lucide-react'

type Tool = 'pen' | 'arrow' | 'circle' | 'text' | 'eraser'
type LineWidth = 2 | 4 | 8

interface PhotoAnnotatorProps {
  imageUrl: string
  onSave: (annotatedDataUrl: string) => void
  onCancel: () => void
}

interface DrawAction {
  imageData: ImageData
}

const COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#000000' },
]

const LINE_WIDTHS: { label: string; value: LineWidth }[] = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
]

export function PhotoAnnotator({ imageUrl, onSave, onCancel }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#ef4444')
  const [lineWidth, setLineWidth] = useState<LineWidth>(4)
  const [isDrawing, setIsDrawing] = useState(false)
  const [history, setHistory] = useState<DrawAction[]>([])
  const [imageLoaded, setImageLoaded] = useState(false)

  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const snapshotBeforeShape = useRef<ImageData | null>(null)

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

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

  // Wave G1 a11y — Escape exits the annotator. Was previously dismissable
  // only via the explicit "Cancel" button; with a full-screen takeover
  // canvas, keyboard users with no easy tab-target on the toolbar lost
  // the standard escape hatch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Load image and setup canvas
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      setImageLoaded(true)

      // Save initial state
      const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory([{ imageData: initialState }])
    }
    img.src = imageUrl
  }, [imageUrl])

  const saveState = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((prev) => [...prev, { imageData }])
  }, [])

  const setupCtx = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return null

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color
    ctx.fillStyle = color

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
    } else {
      ctx.globalCompositeOperation = 'source-over'
    }

    return ctx
  }, [tool, color, lineWidth])

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const point = getCanvasPoint(e)
    if (!point) return

    setIsDrawing(true)
    lastPoint.current = point
    startPoint.current = point

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Save snapshot for shape tools (arrow, circle)
    if (tool === 'arrow' || tool === 'circle') {
      snapshotBeforeShape.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    if (tool === 'text') {
      setIsDrawing(false)
      const text = prompt('Enter annotation text:')
      if (text) {
        const drawCtx = setupCtx()
        if (!drawCtx) return
        drawCtx.globalCompositeOperation = 'source-over'
        drawCtx.font = `${lineWidth * 6}px system-ui, sans-serif`
        drawCtx.fillText(text, point.x, point.y)
        saveState()
      }
      return
    }

    if (tool === 'pen' || tool === 'eraser') {
      const drawCtx = setupCtx()
      if (!drawCtx) return
      drawCtx.beginPath()
      drawCtx.moveTo(point.x, point.y)
    }
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return

    const point = getCanvasPoint(e)
    if (!point) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    if (tool === 'pen' || tool === 'eraser') {
      const drawCtx = setupCtx()
      if (!drawCtx || !lastPoint.current) return

      drawCtx.beginPath()
      drawCtx.moveTo(lastPoint.current.x, lastPoint.current.y)
      drawCtx.lineTo(point.x, point.y)
      drawCtx.stroke()
      lastPoint.current = point
    }

    if ((tool === 'arrow' || tool === 'circle') && snapshotBeforeShape.current && startPoint.current) {
      // Restore snapshot and redraw shape preview
      ctx.putImageData(snapshotBeforeShape.current, 0, 0)
      const drawCtx = setupCtx()
      if (!drawCtx) return

      if (tool === 'arrow') {
        drawArrow(drawCtx, startPoint.current.x, startPoint.current.y, point.x, point.y)
      } else if (tool === 'circle') {
        const rx = Math.abs(point.x - startPoint.current.x)
        const ry = Math.abs(point.y - startPoint.current.y)
        const cx = (startPoint.current.x + point.x) / 2
        const cy = (startPoint.current.y + point.y) / 2
        drawCtx.beginPath()
        drawCtx.ellipse(cx, cy, rx / 2, ry / 2, 0, 0, Math.PI * 2)
        drawCtx.stroke()
      }
    }
  }

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false)
      snapshotBeforeShape.current = null
      lastPoint.current = null
      startPoint.current = null

      // Reset composite operation
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) ctx.globalCompositeOperation = 'source-over'

      saveState()
    }
  }

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) => {
    const headLen = 15 + lineWidth * 2
    const angle = Math.atan2(toY - fromY, toX - fromX)

    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    )
    ctx.moveTo(toX, toY)
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    )
    ctx.stroke()
  }

  const handleUndo = () => {
    if (history.length <= 1) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const newHistory = history.slice(0, -1)
    const prevState = newHistory[newHistory.length - 1]
    if (prevState) {
      ctx.putImageData(prevState.imageData, 0, 0)
    }
    setHistory(newHistory)
  }

  const handleClearAll = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current
    if (!canvas || !ctx || !img) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory([{ imageData }])
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'pen', icon: <Pen size={18} />, label: 'Pen' },
    { id: 'arrow', icon: <ArrowUpRight size={18} />, label: 'Arrow' },
    { id: 'circle', icon: <Circle size={18} />, label: 'Circle' },
    { id: 'text', icon: <Type size={18} />, label: 'Text' },
    { id: 'eraser', icon: <Eraser size={18} />, label: 'Eraser' },
  ]

  // ─── Theme exception ──────────────────────────────────────────────
  // Deliberately dark for photo contrast — does not theme-shift.
  // The annotator overlays a full-screen canvas with engineer-drawn
  // marks (red arrows, yellow circles, etc.) on top of a job photo.
  // A white/light chrome here would compete with the photo for visual
  // weight and wash out the user's annotations on lighter images. So
  // these gray-* and bg-gray-* classes are intentional, NOT a theme
  // bug — every other page in the app uses surface-* tokens.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/95" role="dialog" aria-modal="true" aria-label="Photo annotator">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-2">
        {/* Tools */}
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`rounded-lg p-2 transition-colors ${
                tool === t.id
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className="mx-2 h-6 w-px bg-gray-600" />

        {/* Colors */}
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.name}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${
                color === c.value ? 'scale-110 border-white' : 'border-gray-600'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        <div className="mx-2 h-6 w-px bg-gray-600" />

        {/* Line widths */}
        <div className="flex items-center gap-1">
          {LINE_WIDTHS.map((lw) => (
            <button
              key={lw.value}
              type="button"
              onClick={() => setLineWidth(lw.value)}
              title={lw.label}
              className={`flex items-center rounded-lg p-2 transition-colors ${
                lineWidth === lw.value
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Minus size={18} strokeWidth={lw.value} />
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length <= 1}
              aria-label="Undo"
              className="rounded-lg p-2 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              <Undo2 size={18} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Tooltip.Arrow />
            Undo
          </Tooltip.Content>
        </Tooltip>
        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <button
              type="button"
              onClick={handleClearAll}
              aria-label="Clear all"
              className="rounded-lg p-2 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Tooltip.Arrow />
            Clear all
          </Tooltip.Content>
        </Tooltip>

        <div className="mx-2 h-6 w-px bg-gray-600" />

        <button
          type="button"
          onClick={handleSave}
          disabled={!imageLoaded}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] transition-colors disabled:opacity-50"
        >
          <Save size={16} />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
        >
          <X size={16} />
          Cancel
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-auto p-4"
      >
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full cursor-crosshair rounded-lg touch-none"
          style={{ objectFit: 'contain' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  )
}

export default PhotoAnnotator
