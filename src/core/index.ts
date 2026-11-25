/**
 * scrollframes — scroll-scrubbed image sequences ("video on scroll"), framework-agnostic core.
 *
 * The container's scroll progress through the viewport (0 → 1) picks a frame,
 * which is painted on a <canvas>. Frames are decoded ahead of time so scrubbing
 * never waits on the network or on image decoding.
 */

export type FrameSource =
  /** Array of image URLs, in playback order. */
  | { frames: string[] }
  /** URL of a `manifest.json` produced by the converter: `{ frames: string[], width?, height? }`. Relative frame paths resolve against the manifest URL. */
  | { manifest: string }
  /** URL of a legacy JSON: `[{ id, img }]` where `img` is base64-encoded JPEG. */
  | { base64Json: string; mime?: string }

export type Fit = 'cover' | 'contain'

export interface ScrollFramesOptions {
  /** Element whose scroll through the viewport drives playback (usually a tall wrapper). */
  container: HTMLElement
  /** Canvas to paint frames on. Its CSS size decides the drawing size. */
  canvas: HTMLCanvasElement
  /** Where frames come from. */
  source: FrameSource
  /** How the frame fills the canvas. Default `'cover'`. */
  fit?: Fit
  /** Scroll progress where playback starts / ends (0–1). Default `[0, 1]`. */
  range?: [number, number]
  /** Max parallel image requests while preloading. Default `6`. */
  concurrency?: number
  /** Honour `prefers-reduced-motion`: show a single frame and do not scrub. Default `true`. */
  respectReducedMotion?: boolean
  /** Frame shown when reduced motion is on. Default `0`. */
  reducedMotionFrame?: number
  /** Called once the first frame is painted. */
  onReady?: (info: { frameCount: number }) => void
  /** Called as frames finish loading. */
  onLoadProgress?: (loaded: number, total: number) => void
  /** Called whenever the painted frame changes. */
  onFrame?: (index: number, progress: number) => void
  /** Called if the source cannot be loaded. */
  onError?: (error: unknown) => void
}

export interface ScrollFramesInstance {
  /** Number of frames once known (0 while loading the source). */
  readonly frameCount: number
  /** Index of the frame currently painted. */
  readonly currentFrame: number
  /** Paint the frame for a given progress (0–1) without scrolling. */
  setProgress(progress: number): void
  /** Re-measure and repaint (call after layout changes the observer cannot see). */
  refresh(): void
  /** Remove listeners and release decoded images. */
  destroy(): void
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

/**
 * Progress (0–1) of `el` scrolling past the viewport: 0 when its top reaches the
 * top of the viewport, 1 when its bottom reaches the bottom of the viewport.
 */
export function getScrollProgress(el: HTMLElement, viewportHeight = window.innerHeight): number {
  const rect = el.getBoundingClientRect()
  const scrollable = rect.height - viewportHeight
  if (scrollable <= 0) return rect.top <= 0 ? 1 : 0
  return clamp(-rect.top / scrollable)
}

/** Map a progress value to a frame index, honouring a playback range. */
export function progressToFrame(progress: number, frameCount: number, range: [number, number] = [0, 1]): number {
  if (frameCount <= 0) return 0
  const [start, end] = range
  const local = end > start ? clamp((progress - start) / (end - start)) : progress >= end ? 1 : 0
  return Math.min(frameCount - 1, Math.floor(local * frameCount))
}

/** Resolve a FrameSource to a list of image URLs. */
export async function resolveFrameUrls(source: FrameSource, signal?: AbortSignal): Promise<string[]> {
  if ('frames' in source) return source.frames
  if ('manifest' in source) {
    const res = await fetch(source.manifest, { signal })
    if (!res.ok) throw new Error(`scrollframes: manifest ${source.manifest} → HTTP ${res.status}`)
    const data = (await res.json()) as { frames?: string[] }
    if (!Array.isArray(data.frames)) throw new Error('scrollframes: manifest has no "frames" array')
    const base = new URL(source.manifest, document.baseURI)
    return data.frames.map((f) => new URL(f, base).href)
  }
  const res = await fetch(source.base64Json, { signal })
  if (!res.ok) throw new Error(`scrollframes: ${source.base64Json} → HTTP ${res.status}`)
  const data = (await res.json()) as Array<{ img: string }>
  const mime = source.mime ?? 'image/jpeg'
  return data.map((d) => (d.img.startsWith('data:') ? d.img : `data:${mime};base64,${d.img}`))
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  // decode() resolves once the bitmap is ready to paint without a hitch.
  return img.decode().then(
    () => img,
    () =>
      new Promise((resolve, reject) => {
        if (img.complete && img.naturalWidth) return resolve(img)
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`scrollframes: could not load frame ${url.slice(0, 80)}`))
      }),
  )
}

function drawFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, fit: Fit) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/**
 * Start scrubbing an image sequence on `canvas` as `container` scrolls.
 * Must run in the browser (call it from an effect / mounted hook when using SSR).
 */
export function createScrollFrames(options: ScrollFramesOptions): ScrollFramesInstance {
  const {
    container,
    canvas,
    source,
    fit = 'cover',
    range = [0, 1],
    concurrency = 6,
    respectReducedMotion = true,
    reducedMotionFrame = 0,
    onReady,
    onLoadProgress,
    onFrame,
    onError,
  } = options

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('scrollframes: 2D canvas context unavailable')

  const abort = new AbortController()
  const reduced = respectReducedMotion && prefersReducedMotion()
  let images: Array<HTMLImageElement | undefined> = []
  let frameCount = 0
  let current = -1
  let wanted = 0
  let ready = false
  let destroyed = false
  let rafId = 0
  let manualProgress: number | null = null

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(canvas.clientWidth * dpr)
    const h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      return true
    }
    return false
  }

  /** Closest loaded frame to `index`, preferring earlier ones (keeps motion monotonic). */
  const nearestLoaded = (index: number) => {
    for (let d = 0; d < frameCount; d++) {
      if (images[index - d]) return index - d
      if (images[index + d]) return index + d
    }
    return -1
  }

  const paint = (force = false) => {
    if (!frameCount) return
    const target = nearestLoaded(wanted)
    if (target < 0 || (target === current && !force)) return
    drawFit(ctx, images[target]!, canvas.width, canvas.height, fit)
    current = target
    if (!ready) {
      ready = true
      onReady?.({ frameCount })
    }
    onFrame?.(target, manualProgress ?? getScrollProgress(container))
  }

  const update = () => {
    rafId = 0
    if (destroyed) return
    const progress = manualProgress ?? (reduced ? 0 : getScrollProgress(container))
    wanted = reduced ? clamp(reducedMotionFrame, 0, Math.max(0, frameCount - 1)) : progressToFrame(progress, frameCount, range)
    paint()
  }

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(update)
  }

  const onScroll = () => {
    manualProgress = null
    schedule()
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (sizeCanvas()) paint(true)
          schedule()
        })
      : null

  const preload = async (urls: string[]) => {
    // Load the frame we need first, then the rest in order with bounded parallelism.
    const first = reduced ? clamp(reducedMotionFrame, 0, urls.length - 1) : progressToFrame(getScrollProgress(container), urls.length, range)
    const order = [first, ...urls.map((_, i) => i).filter((i) => i !== first)]
    let next = 0
    let loaded = 0
    const worker = async () => {
      while (!destroyed && next < order.length) {
        const i = order[next++]
        try {
          images[i] = await loadImage(urls[i])
        } catch (err) {
          onError?.(err)
        }
        if (destroyed) return
        loaded++
        onLoadProgress?.(loaded, urls.length)
        // Repaint if this frame is closer to the one we want than what is on screen.
        if (i === wanted || current < 0 || Math.abs(i - wanted) < Math.abs(current - wanted)) paint()
      }
    }
    // With reduced motion only one frame is ever shown: don't download the rest.
    const workers = reduced ? 1 : Math.max(1, concurrency)
    if (reduced) order.length = 1
    await Promise.all(Array.from({ length: workers }, worker))
  }

  sizeCanvas()
  resizeObserver?.observe(canvas)
  if (!reduced) {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
  }

  resolveFrameUrls(source, abort.signal)
    .then((urls) => {
      if (destroyed) return
      frameCount = urls.length
      images = new Array(frameCount)
      update()
      return preload(urls)
    })
    .catch((err) => {
      if (!destroyed && (err as Error)?.name !== 'AbortError') onError?.(err)
    })

  return {
    get frameCount() {
      return frameCount
    },
    get currentFrame() {
      return current
    },
    setProgress(progress: number) {
      manualProgress = clamp(progress)
      schedule()
    },
    refresh() {
      sizeCanvas()
      paint(true)
      schedule()
    },
    destroy() {
      destroyed = true
      abort.abort()
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      resizeObserver?.disconnect()
      images = []
    },
  }
}
