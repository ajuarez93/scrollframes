export const FRAMES = './frames/manifest.json'
export const POSTER = './poster.jpg'

export const panels = [
  ['Scroll drives the frames', 'Each scroll position maps to one frame of the sequence, painted on a canvas.'],
  ['Only what fits', 'Frames start downloading one viewport before the player, at the size that fits your screen (AVIF, 480 or 854 px here).'],
  ['Smooth', 'smoothing eases the playhead towards the scroll position, like inertia on a trackpad.'],
  ['Reduced motion', 'With prefers-reduced-motion the player shows a single still frame and skips the rest of the download.'],
]
