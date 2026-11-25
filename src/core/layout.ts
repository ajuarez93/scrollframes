/**
 * Shared layout for the framework components:
 *
 *   <div wrapper  position:relative; min-height: <scroll length>>
 *     <div stage  position:sticky; top:0; height:100vh>  <canvas/>  </div>
 *     <div content  position:relative; margin-top:-100vh>  {children scroll over the frames}  </div>
 *   </div>
 *
 * `position: sticky` (not `fixed`) keeps the stage inside the wrapper, so it works
 * under transformed ancestors and stops pinning once the wrapper scrolls away.
 */
export const DEFAULT_SCROLL_LENGTH = '300vh'

export function scrollLength(frameCount: number, pxPerFrame?: number, height?: string | number): string {
  if (pxPerFrame && frameCount) return `${frameCount * pxPerFrame}px`
  if (typeof height === 'number') return `${height}px`
  return height ?? DEFAULT_SCROLL_LENGTH
}

export const wrapperStyle = (minHeight: string) => ({ position: 'relative', minHeight }) as const

export const stageStyle = {
  position: 'sticky',
  top: 0,
  height: '100vh',
  width: '100%',
  overflow: 'hidden',
} as const

export const canvasStyle = { display: 'block', width: '100%', height: '100%' } as const

export const contentStyle = { position: 'relative', marginTop: '-100vh' } as const
