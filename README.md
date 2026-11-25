# scrollframes

Scroll-scrubbed image sequences — the "video that plays as you scroll" effect — painted on a `<canvas>`.
Framework-agnostic core, React and Vue 3 components, and a Python converter that turns any video into frames.

[![npm](https://img.shields.io/npm/v/scrollframes.svg)](https://www.npmjs.com/package/scrollframes)
[![license](https://img.shields.io/npm/l/scrollframes.svg)](./LICENSE)

**[Live demo →](https://ajuarez93.github.io/scrollframes/)** · [Vanilla](https://ajuarez93.github.io/scrollframes/index.html) · [React](https://ajuarez93.github.io/scrollframes/react.html) · [Vue](https://ajuarez93.github.io/scrollframes/vue.html)

![scrollframes demo: scrolling the page scrubs through a clip frame by frame](https://raw.githubusercontent.com/ajuarez93/scrollframes/main/.github/assets/demo.gif)

## Why frames and not a `<video>`?

Setting `video.currentTime` on scroll stutters: browsers seek to the nearest keyframe and decode forward.
scrollframes pre-decodes every frame as an image and paints the one that matches the scroll position, so
scrubbing is instant in both directions.

- **Canvas rendering** with `cover` / `contain` fit and HiDPI support
- **Progressive preload** — the visible frame loads first, the rest in parallel (bounded concurrency)
- **`prefers-reduced-motion`** — shows a single still frame and skips downloading the rest
- **SSR-safe** — nothing touches `window` until mount
- **`position: sticky` layout**, so it works under transformed ancestors (no `position: fixed` traps)
- **~3 KB** gzipped core, zero dependencies

## Install

```bash
npm install scrollframes
```

## 1. Convert your video

The converter lives in [`converter/`](./converter) (also shipped inside the npm package).

```bash
pip install -r converter/requirements.txt          # opencv-python-headless
python converter/scrollframes_convert.py hero.mp4 -o public/hero
# 168 frames -> public/hero (1.9 MB)
```

This writes `public/hero/frame_0001.webp … ` plus a `manifest.json`.

| Flag | Default | |
|---|---|---|
| `--format webp\|jpg` | `webp` | image format |
| `--quality N` | `75` | encoder quality (1–100) |
| `--width N` | source | resize, keeping aspect ratio |
| `--step N` | `1` | keep every Nth frame (fewer frames = lighter page) |
| `--start N` / `--end N` | whole video | frame range to keep |
| `--json` | off | write one JSON file of base64 JPEGs (`[{ id, img }]`) instead of a folder |

Rule of thumb: 120–200 frames at 960–1600px wide is plenty for a full-screen hero.

## 2a. As a component — React

```jsx
import { ScrollFrames } from 'scrollframes/react'

export function Hero() {
  return (
    <ScrollFrames manifest="/hero/manifest.json" height="400vh" overlay={<h1 className="title">Hello</h1>}>
      {/* optional: content that scrolls over the pinned frames */}
      <section style={{ height: '100vh' }}>Chapter one</section>
    </ScrollFrames>
  )
}
```

There is also a `useScrollFrames(containerRef, canvasRef, source, options)` hook for fully custom markup.

## 2b. As a component — Vue 3

```vue
<script setup>
import { ScrollFrames } from 'scrollframes/vue'
</script>

<template>
  <ScrollFrames manifest="/hero/manifest.json" height="400vh" @frame="(i) => console.log(i)">
    <template #overlay><h1 class="title">Hello</h1></template>
    <section style="height: 100vh">Chapter one</section>
  </ScrollFrames>
</template>
```

## 2c. As a library — any framework or none

```js
import { createScrollFrames } from 'scrollframes'

const player = createScrollFrames({
  container: document.querySelector('#hero'),   // tall element that scrolls
  canvas: document.querySelector('#hero canvas'), // usually inside a sticky child
  source: { manifest: '/hero/manifest.json' },
  onFrame: (index, progress) => {},
})

// later
player.destroy()
```

```html
<section id="hero" style="position: relative; height: 400vh">
  <div style="position: sticky; top: 0; height: 100vh">
    <canvas style="width: 100%; height: 100%; display: block"></canvas>
  </div>
</section>
```

## Options

Component props and `createScrollFrames` options share the same names.

| Option | Type | Default | |
|---|---|---|---|
| `manifest` / `frames` / `base64Json` | `string` / `string[]` / `string` | — | frame source (one of them). In the core API: `source: { manifest }` etc. |
| `fit` | `'cover' \| 'contain'` | `'cover'` | how a frame fills the canvas |
| `range` | `[start, end]` | `[0, 1]` | part of the scroll that plays the sequence |
| `height` | CSS length / px | `'300vh'` | total scroll length (components only) |
| `pxPerFrame` | `number` | — | scroll length per frame; overrides `height` (components only) |
| `concurrency` | `number` | `6` | parallel image requests while preloading |
| `respectReducedMotion` | `boolean` | `true` | still frame when the user prefers reduced motion |
| `reducedMotionFrame` | `number` | `0` | which frame to show in that case |
| `onReady` / `onLoadProgress` / `onFrame` / `onError` | callbacks | — | in Vue: `@ready`, `@load-progress`, `@frame`, `@error` |

Instance methods: `setProgress(0..1)`, `refresh()`, `destroy()`, plus `frameCount` and `currentFrame`.
Helpers: `getScrollProgress(el)`, `progressToFrame(progress, count, range)`, `resolveFrameUrls(source)`.

## Development

```bash
npm install
npm run demo        # Vite dev server with the three demos
npm run build       # dist/ (ESM + CJS + types)
```

## Credits

Demo footage: [Sintel](https://durian.blender.org/) trailer (0:24–0:31), © Blender Foundation, licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The footage is only used by the demo and is not part of the npm package.

## License

MIT © [Jose Alfonso Guerrero Juarez](https://www.ajuarez93.com)
