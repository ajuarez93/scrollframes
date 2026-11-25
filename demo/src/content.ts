export const FRAMES = './frames/manifest.json'

export const panels = [
  ['Scroll drives the frames', 'Each scroll position maps to one frame of the sequence, painted on a canvas.'],
  ['Pre-decoded', 'Frames are decoded ahead of time, so scrubbing never waits on the network.'],
  ['Content on top', 'Anything you put as children scrolls over the pinned canvas.'],
  ['Reduced motion', 'With prefers-reduced-motion the player shows a single still frame.'],
]
