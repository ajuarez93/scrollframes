import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { createScrollFrames, type Fit, type FrameSource, type Preload, type ScrollFramesInstance } from '../core/index'
import { canvasStyle, contentStyle, scrollLength, stageStyle, wrapperStyle } from '../core/layout'

export * from '../core/index'

/**
 * Vue 3 component: a pinned canvas that plays an image sequence as the page scrolls.
 *
 * Slots: default = content that scrolls over the frames; `overlay` = content pinned on top of the canvas
 * (scoped: receives `{ progress, frame }`).
 * Events: `ready`, `load-progress`, `frame`, `progress`, `error`.
 */
export const ScrollFrames = defineComponent({
  name: 'ScrollFrames',
  props: {
    frames: { type: Array as PropType<string[]>, default: undefined },
    manifest: { type: String, default: undefined },
    base64Json: { type: String, default: undefined },
    fit: { type: String as PropType<Fit>, default: 'cover' },
    range: { type: Array as unknown as PropType<[number, number]>, default: undefined },
    pxPerFrame: { type: Number, default: undefined },
    height: { type: [String, Number], default: undefined },
    respectReducedMotion: { type: Boolean, default: true },
    reducedMotionFrame: { type: Number, default: 0 },
    concurrency: { type: Number, default: 6 },
    preload: { type: String as PropType<Preload>, default: 'visible' },
    preloadMargin: { type: String, default: '100% 0px' },
    poster: { type: String, default: undefined },
    smoothing: { type: Number, default: 0 },
    canvasLabel: { type: String, default: 'Scroll-driven animation' },
  },
  emits: ['ready', 'load-progress', 'frame', 'progress', 'error'],
  setup(props, { slots, emit, expose }) {
    const container = ref<HTMLElement | null>(null)
    const canvas = ref<HTMLCanvasElement | null>(null)
    const frameCount = ref(0)
    const progress = ref(0)
    const frame = ref(0)
    let instance: ScrollFramesInstance | null = null

    const source = (): FrameSource | null => {
      if (props.frames) return { frames: props.frames }
      if (props.manifest) return { manifest: props.manifest }
      if (props.base64Json) return { base64Json: props.base64Json }
      return null
    }

    const start = () => {
      instance?.destroy()
      instance = null
      const src = source()
      if (!src || !container.value || !canvas.value) return
      instance = createScrollFrames({
        container: container.value,
        canvas: canvas.value,
        source: src,
        fit: props.fit,
        range: props.range,
        concurrency: props.concurrency,
        respectReducedMotion: props.respectReducedMotion,
        reducedMotionFrame: props.reducedMotionFrame,
        preload: props.preload,
        preloadMargin: props.preloadMargin,
        poster: props.poster,
        smoothing: props.smoothing,
        onReady: (info) => {
          frameCount.value = info.frameCount
          emit('ready', info)
        },
        onLoadProgress: (loaded, total) => emit('load-progress', loaded, total),
        onFrame: (index, p) => {
          frame.value = index
          emit('frame', index, p)
        },
        onProgress: (p) => {
          progress.value = p
          emit('progress', p)
        },
        onError: (error) => emit('error', error),
      })
    }

    onMounted(start)
    onBeforeUnmount(() => instance?.destroy())
    watch(
      () => [
        props.frames?.join('\n'),
        props.manifest,
        props.base64Json,
        props.fit,
        props.range?.join(','),
        props.concurrency,
        props.respectReducedMotion,
        props.reducedMotionFrame,
        props.preload,
        props.preloadMargin,
        props.poster,
        props.smoothing,
      ],
      start,
    )

    expose({
      setProgress: (p: number) => instance?.setProgress(p),
      refresh: () => instance?.refresh(),
    })

    return () =>
      h('div', { ref: container, style: wrapperStyle(scrollLength(frameCount.value, props.pxPerFrame, props.height)) }, [
        h('div', { style: stageStyle }, [
          h('canvas', { ref: canvas, style: canvasStyle, role: 'img', 'aria-label': props.canvasLabel }),
          slots.overlay?.({ progress: progress.value, frame: frame.value }),
        ]),
        slots.default ? h('div', { style: contentStyle }, slots.default()) : null,
      ])
  },
})

