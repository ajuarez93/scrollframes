# Changelog

## 0.2.0 — 2026-11-25

### Added
- Lazy loading: `preload: 'visible'` (default) waits until the player is near the viewport; `preloadMargin` tunes it.
- Responsive sources: v2 manifests with size `variants`; the player picks the smallest one that covers the canvas.
- Coarse-to-fine preload order (`loadOrder`): scrubbing anywhere shows a nearby frame early.
- `smoothing` option to ease the playhead towards the scroll position.
- `poster` option, shown until the first frame paints.
- `onProgress` callback and `progress` getter; React `renderOverlay`; Vue scoped `#overlay` slot and `@progress` event.
- Frames are decoded to `ImageBitmap` when available and released on `destroy()`.
- Converter: `--widths` (several sizes from one decode) and `--format avif` (via Pillow ≥ 11.3).
- Unit tests (vitest) and a converter smoke test in CI.

### Changed
- `progressToFrame` now spreads progress over `0..frameCount-1`, so 100% lands exactly on the last frame.
- `resolveFrameUrls(source, targetWidth?, signal?)` gained a `targetWidth` argument before `signal`.

## 0.1.0 — 2026-11-25

- First release: canvas player core, React and Vue components, Python converter (frames + manifest, legacy base64 JSON).
