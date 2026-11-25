import './demo.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ScrollFrames } from 'scrollframes/react'
import { FRAMES, POSTER, panels } from './content'

function App() {
  const [hud, setHud] = useState('loading…')
  return (
    <>
      <section className="intro"><h1>scrollframes</h1><p>React — <code>&lt;ScrollFrames /&gt;</code>. Scroll down.</p></section>
      <ScrollFrames
        manifest={FRAMES}
        poster={POSTER}
        smoothing={0.8}
        overlay={<div className="hud">{hud}</div>}
        renderOverlay={({ progress }) => <div className="bar" style={{ transform: `scaleX(${progress})` }} />}
        onFrame={(i, p) => setHud(`frame ${i + 1} · ${(p * 100).toFixed(0)}%`)}
      >
        {panels.map(([title, text]) => (
          <div className="panel" key={title}><div><h2>{title}</h2><p>{text}</p></div></div>
        ))}
      </ScrollFrames>
      <section className="outro"><h1>Fin.</h1></section>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<App />)
