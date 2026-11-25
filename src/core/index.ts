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
  /**
   * URL of a `manifest.json` produced by the converter. Version 1 lists `frames`;
   * version 2 lists size `variants` and the player picks the one that fits the canvas.
   * Relative paths resolve against the manifest URL.
   */
  | { manifest: string }
  /** URL of a legacy JSON: `[{ id, img }]` where `img` is base64-encoded JPEG. */
  | { base64Json: string; mime?: string }

export type Fit = 'cover' | 'contain'

/** `'visible'` waits until the player is about one viewport away; `'eager'` starts on creation. */
export type Preload = 'visible' | 'eager'

export interface ManifestVariant {
  width: number
  height?: number
  /** Folder of this variant, relative to the manifest. */
  dir?: string
  frames: string[]
}

export interface Manifest {
  version?: number
  width?: number
  height?: number
  format?: string
  /** v1: frame paths. */
  frames?: string[]
  /** v2: one entry per encoded width. */
  variants?: ManifestVariant[]
}

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
  /** When to start downloading. Default `'visible'`. */
  preload?: Preload
  /** How far outside the viewport `'visible'` preloading starts (IntersectionObserver rootMargin). Default `'100% 0px'`. */
  preloadMargin?: string
  /** Image shown on the canvas until the first frame is ready (helps LCP). */
  poster?: string
  /**
   * Easing towards the scroll position, 0–1. `0` (default) jumps straight to the frame;
   * `0.85` glides smoothly, like inertia on a trackpad.
   */
  smoothing?: number
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
  /** Called on every scroll update with the raw progress (0–1), even if the frame did not change. */
  onProgress?: (progress: number) => void
  /** Called if the source cannot be loaded. */
  onError?: (error: unknown) => void
}

export interface ScrollFramesInstance {
  /** Number of frames once known (0 while loading the source). */
  readonly frameCount: number
  /** Index of the frame currently painted (-1 before the first paint). */
  readonly currentFrame: number
  /** Latest scroll progress (0–1). */
  readonly progress: number
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
export function getScrollProgress(el: Element, viewportHeight = window.innerHeight): number {
  const rect = el.getBoundingClientRect()
  const scrollable = rect.height - viewportHeight
  if (scrollable <= 0) return rect.top <= 0 ? 1 : 0
  return clamp(-rect.top / scrollable)
}

/** Map a progress value to a (fractional) frame position, honouring a playback range. */
export function progressToPosition(progress: number, frameCount: number, range: [number, number] = [0, 1]): number {
  if (frameCount <= 0) return 0
  const [start, end] = range
  const local = end > start ? clamp((progress - start) / (end - start)) : progress >= end ? 1 : 0
  return local * (frameCount - 1)
}

/** Map a progress value to a frame index, honouring a playback range. */
export function progressToFrame(progress: number, frameCount: number, range: [number, number] = [0, 1]): number {
  return Math.round(progressToPosition(progress, frameCount, range))
}

/** Pick the smallest variant at least `targetWidth` px wide (or the widest one if none is). */
export function pickVariant<T extends { width: number }>(variants: T[], targetWidth: number): T {
  if (!variants.length) throw new Error('scrollframes: manifest has an empty "variants" array')
  const sorted = [...variants].sort((a, b) => a.width - b.width)
  return sorted.find((v) => v.width >= targetWidth) ?? sorted[sorted.length - 1]
}

/**
 * Download order for `count` frames: `first`, then every 16th, 8th, 4th, 2nd and finally
 * every frame. Scrubbing anywhere shows a nearby frame long before the whole set arrives.
 */
export function loadOrder(count: number, first = 0): number[] {
  const seen = new Set<number>()
  const order: number[] = []
  const add = (i: number) => {
    if (i >= 0 && i < count && !seen.has(i)) {
      seen.add(i)
      order.push(i)
    }
  }
  add(first)
  for (let stride = 16; stride >= 1; stride /= 2) for (let i = 0; i < count; i += stride) add(i)
  return order
}

function baseHref(): string {
  return typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
}

/**
 * Resolve a FrameSource to a list of image URLs.
 * `targetWidth` (device pixels) picks the variant of a v2 manifest.
 */
export async function resolveFrameUrls(source: FrameSource, targetWidth = Infinity, signal?: AbortSignal): Promise<string[]> {
  if ('frames' in source) return source.frames
  if ('manifest' in source) {
    const res = await fetch(source.manifest, { signal })
    if (!res.ok) throw new Error(`scrollframes: manifest ${source.manifest} → HTTP ${res.status}`)
    const data = (await res.json()) as Manifest
    const base = new URL(source.manifest, baseHref())
    if (Array.isArray(data.variants)) {
      const v = pickVariant(data.variants, targetWidth)
      const dir = new URL(v.dir ? v.dir.replace(/\/?$/, '/') : './', base)
      return v.frames.map((f) => new URL(f, dir).href)
    }
    if (!Array.isArray(data.frames)) throw new Error('scrollframes: manifest has no "frames" or "variants"')
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

type Drawable = HTMLImageElement | ImageBitmap

function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
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

/** Decode to an ImageBitmap when supported: painting it never triggers a decode on the main thread. */
async function loadFrame(url: string): Promise<Drawable> {
  const img = await loadImage(url)
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(img)
    } catch {
      /* fall back to the <img> */
    }
  }
  return img
}

const sizeOf = (d: Drawable) => ('naturalWidth' in d ? [d.naturalWidth, d.naturalHeight] : [d.width, d.height])

function drawFit(ctx: CanvasRenderingContext2D, img: Drawable, w: number, h: number, fit: Fit) {
  const [iw, ih] = sizeOf(img)
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
    preload = 'visible',
    preloadMargin = '100% 0px',
    poster,
    smoothing = 0,
    concurrency = 6,
    respectReducedMotion = true,
    reducedMotionFrame = 0,
    onReady,
    onLoadProgress,
    onFrame,
    onProgress,
    onError,
  } = options

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('scrollframes: 2D canvas context unavailable')

  const abort = new AbortController()
  const reduced = respectReducedMotion && prefersReducedMotion()
  const ease = clamp(smoothing, 0, 0.98)
  let images: Array<Drawable | undefined> = []
  let frameCount = 0
  let current = -1
  let shown = -1 // smoothed fractional position
  let progress = 0
  let ready = false
  let started = false
  let destroyed = false
  let rafId = 0
  let manualProgress: number | null = null

  if (poster) {
    canvas.style.backgroundImage = `url("${poster}")`
    canvas.style.backgroundSize = fit
    canvas.style.backgroundPosition = 'center'
    canvas.style.backgroundRepeat = 'no-repeat'
  }

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

  const paint = (index: number, force = false) => {
    if (!frameCount) return
    const target = nearestLoaded(index)
    if (target < 0 || (target === current && !force)) return
    drawFit(ctx, images[target]!, canvas.width, canvas.height, fit)
    current = target
    if (!ready) {
      ready = true
      if (poster) canvas.style.backgroundImage = ''
      onReady?.({ frameCount })
    }
    onFrame?.(target, progress)
  }

  const targetPosition = () =>
    reduced ? clamp(reducedMotionFrame, 0, Math.max(0, frameCount - 1)) : progressToPosition(progress, frameCount, range)

  const update = () => {
    rafId = 0
    if (destroyed) return
    const next = manualProgress ?? (reduced ? 0 : getScrollProgress(container))
    if (next !== progress) {
      progress = next
      onProgress?.(progress)
    }
    if (!frameCount) return
    const target = targetPosition()
    if (shown < 0 || ease === 0) shown = target
    else shown += (target - shown) * (1 - ease)
    if (Math.abs(target - shown) < 0.01) shown = target
    paint(Math.round(shown))
    // Keep gliding until the smoothed position catches up with the scroll.
    if (shown !== target) schedule()
  }

  function schedule() {
    if (!rafId && !destroyed) rafId = requestAnimationFrame(update)
  }

  const onScroll = () => {
    manualProgress = null
    schedule()
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (sizeCanvas() && current >= 0) paint(current, true)
          schedule()
        })
      : null

  const preloadFrames = async (urls: string[]) => {
    // The frame on screen first, then coarse-to-fine so every scroll position soon has a near frame.
    const order = loadOrder(urls.length, Math.round(targetPosition()))
    // With reduced motion only one frame is ever shown: don't download the rest.
    if (reduced) order.length = 1
    let next = 0
    let loaded = 0
    const worker = async () => {
      while (!destroyed && next < order.length) {
        const i = order[next++]
        try {
          images[i] = await loadFrame(urls[i])
        } catch (err) {
          onError?.(err)
        }
        if (destroyed) {
          const d = images[i]
          if (d && 'close' in d) d.close()
          return
        }
        loaded++
        onLoadProgress?.(loaded, order.length)
        paint(Math.round(shown < 0 ? targetPosition() : shown))
      }
    }
    await Promise.all(Array.from({ length: reduced ? 1 : Math.max(1, concurrency) }, worker))
  }

  const start = () => {
    if (started || destroyed) return
    started = true
    intersection?.disconnect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    resolveFrameUrls(source, canvas.clientWidth * dpr || window.innerWidth * dpr, abort.signal)
      .then((urls) => {
        if (destroyed) return
        frameCount = urls.length
        images = new Array(frameCount)
        update()
        return preloadFrames(urls)
      })
      .catch((err) => {
        if (!destroyed && (err as Error)?.name !== 'AbortError') onError?.(err)
      })
  }

  const intersection =
    preload === 'visible' && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: preloadMargin })
      : null

  sizeCanvas()
  resizeObserver?.observe(canvas)
  if (!reduced) {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
  }
  if (intersection) intersection.observe(container)
  else start()

  return {
    get frameCount() {
      return frameCount
    },
    get currentFrame() {
      return current
    },
    get progress() {
      return progress
    },
    setProgress(p: number) {
      manualProgress = clamp(p)
      start()
      schedule()
    },
    refresh() {
      sizeCanvas()
      if (current >= 0) paint(current, true)
      schedule()
    },
    destroy() {
      destroyed = true
      abort.abort()
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      resizeObserver?.disconnect()
      intersection?.disconnect()
      for (const d of images) if (d && 'close' in d) d.close()
      images = []
    },
  }
}
