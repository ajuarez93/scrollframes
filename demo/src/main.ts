import './demo.css'
import { createScrollFrames } from 'scrollframes'
import { FRAMES, POSTER } from './content'

// Library usage: you own the markup, scrollframes only drives the canvas.
document.getElementById('app')!.innerHTML = `
  <section class="intro"><h1>scrollframes</h1><p>Vanilla JS — <code>createScrollFrames()</code>. Scroll down.</p></section>
  <section id="player" style="position:relative;height:400vh">
    <div style="position:sticky;top:0;height:100vh">
      <canvas id="canvas" style="width:100%;height:100%;display:block"></canvas>
      <div class="hud" id="hud">loading…</div>
    </div>
  </section>
  <section class="outro"><h1>Fin.</h1><p>Same player as a component: <a href="./react.html">React</a> · <a href="./vue.html">Vue</a></p></section>`

const hud = document.getElementById('hud')!
createScrollFrames({
  container: document.getElementById('player')!,
  canvas: document.getElementById('canvas') as HTMLCanvasElement,
  source: { manifest: FRAMES },
  poster: POSTER,
  smoothing: 0.8,
  onLoadProgress: (l, t) => { if (l < t) hud.textContent = `loading ${l}/${t}` },
  onFrame: (i, p) => { hud.textContent = `frame ${i + 1} · ${(p * 100).toFixed(0)}%` },
})
