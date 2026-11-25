import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createScrollFrames, type Fit, type FrameSource, type ScrollFramesInstance } from '../core/index'
import { canvasStyle, contentStyle, scrollLength, stageStyle, wrapperStyle } from '../core/layout'

export * from '../core/index'

export interface ScrollFramesProps {
  /** Array of frame URLs. Use one of `frames`, `manifest` or `base64Json`. */
  frames?: string[]
  /** URL of a manifest.json produced by the converter. */
  manifest?: string
  /** URL of a legacy `[{ id, img }]` base64 JSON. */
  base64Json?: string
  fit?: Fit
  range?: [number, number]
  /** Scroll length in px for each frame. Overrides `height` once frames are known. */
  pxPerFrame?: number
  /** Total scroll length (CSS length or px). Default `300vh`. */
  height?: string | number
  respectReducedMotion?: boolean
  reducedMotionFrame?: number
  concurrency?: number
  className?: string
  style?: CSSProperties
  /** Extra content inside the pinned stage, on top of the canvas (scroll hint, title…). */
  overlay?: ReactNode
  /** Content that scrolls over the frames. */
  children?: ReactNode
  canvasLabel?: string
  onReady?: (info: { frameCount: number }) => void
  onLoadProgress?: (loaded: number, total: number) => void
  onFrame?: (index: number, progress: number) => void
  onError?: (error: unknown) => void
}

function toSource({ frames, manifest, base64Json }: ScrollFramesProps): FrameSource | null {
  if (frames) return { frames }
  if (manifest) return { manifest }
  if (base64Json) return { base64Json }
  return null
}

/** React component: a pinned canvas that plays an image sequence as the page scrolls. */
export function ScrollFrames(props: ScrollFramesProps) {
  const { fit, range, pxPerFrame, height, respectReducedMotion, reducedMotionFrame, concurrency } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frameCount, setFrameCount] = useState(0)

  // Callbacks change identity every render; keep the latest without restarting the player.
  const callbacks = useRef(props)
  callbacks.current = props

  const sourceKey = props.frames ? props.frames.join('\n') : (props.manifest ?? props.base64Json ?? '')
  const rangeKey = range ? range.join(',') : ''

  useEffect(() => {
    const source = toSource(callbacks.current)
    if (!source || !containerRef.current || !canvasRef.current) return
    const instance: ScrollFramesInstance = createScrollFrames({
      container: containerRef.current,
      canvas: canvasRef.current,
      source,
      fit,
      range,
      concurrency,
      respectReducedMotion,
      reducedMotionFrame,
      onReady: (info) => {
        setFrameCount(info.frameCount)
        callbacks.current.onReady?.(info)
      },
      onLoadProgress: (l, t) => callbacks.current.onLoadProgress?.(l, t),
      onFrame: (i, p) => callbacks.current.onFrame?.(i, p),
      onError: (e) => callbacks.current.onError?.(e),
    })
    return () => instance.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, fit, rangeKey, concurrency, respectReducedMotion, reducedMotionFrame])

  return (
    <div ref={containerRef} className={props.className} style={{ ...wrapperStyle(scrollLength(frameCount, pxPerFrame, height)), ...props.style }}>
      <div style={stageStyle}>
        <canvas ref={canvasRef} style={canvasStyle} role="img" aria-label={props.canvasLabel ?? 'Scroll-driven animation'} />
        {props.overlay}
      </div>
      {props.children != null && <div style={contentStyle}>{props.children}</div>}
    </div>
  )
}

/**
 * Hook for custom layouts: wire your own container and canvas refs.
 * Returns the live instance (null until mounted).
 */
export function useScrollFrames(
  containerRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  source: FrameSource,
  options: { fit?: Fit; range?: [number, number]; respectReducedMotion?: boolean } = {},
): ScrollFramesInstance | null {
  const [instance, setInstance] = useState<ScrollFramesInstance | null>(null)
  const key = JSON.stringify(source) + JSON.stringify(options)
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return
    const inst = createScrollFrames({ container: containerRef.current, canvas: canvasRef.current, source, ...options })
    setInstance(inst)
    return () => {
      inst.destroy()
      setInstance(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return instance
}

