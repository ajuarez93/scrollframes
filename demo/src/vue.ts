import './demo.css'
import { createApp, h, ref } from 'vue'
import { ScrollFrames } from 'scrollframes/vue'
import { FRAMES, POSTER, panels } from './content'

// Written with render functions so the demo needs no SFC compiler; in an app you'd use a template:
// <ScrollFrames manifest="/frames/manifest.json" @frame="onFrame"> ... </ScrollFrames>
createApp({
  setup() {
    const hud = ref('loading…')
    return () => [
      h('section', { class: 'intro' }, [h('h1', 'scrollframes'), h('p', ['Vue 3 — ', h('code', '<ScrollFrames>'), '. Scroll down.'])]),
      h(
        ScrollFrames,
        { manifest: FRAMES, poster: POSTER, smoothing: 0.8, onFrame: (i: number, p: number) => (hud.value = `frame ${i + 1} · ${(p * 100).toFixed(0)}%`) },
        {
          overlay: ({ progress }: { progress: number }) => [
            h('div', { class: 'hud' }, hud.value),
            h('div', { class: 'bar', style: { transform: `scaleX(${progress})` } }),
          ],
          default: () => panels.map(([title, text]) => h('div', { class: 'panel' }, [h('div', [h('h2', title), h('p', text)])])),
        },
      ),
      h('section', { class: 'outro' }, [h('h1', 'Fin.')]),
    ]
  },
}).mount('#app')
