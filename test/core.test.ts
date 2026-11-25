import { afterEach, describe, expect, it, vi } from 'vitest'
import { getScrollProgress, pickVariant, progressToFrame, progressToPosition, resolveFrameUrls } from '../src/core/index'
import { scrollLength } from '../src/core/layout'

const el = (top: number, height: number) => ({ getBoundingClientRect: () => ({ top, height }) }) as unknown as Element

describe('getScrollProgress', () => {
  it('is 0 before the element reaches the top and 1 at its end', () => {
    expect(getScrollProgress(el(100, 3000), 1000)).toBe(0)
    expect(getScrollProgress(el(-1000, 3000), 1000)).toBe(0.5)
    expect(getScrollProgress(el(-5000, 3000), 1000)).toBe(1)
  })
  it('handles elements shorter than the viewport', () => {
    expect(getScrollProgress(el(10, 500), 1000)).toBe(0)
    expect(getScrollProgress(el(-1, 500), 1000)).toBe(1)
  })
})

describe('progressToFrame / progressToPosition', () => {
  it('maps the full range onto first..last frame', () => {
    expect(progressToFrame(0, 100)).toBe(0)
    expect(progressToFrame(1, 100)).toBe(99)
    expect(progressToFrame(0.5, 101)).toBe(50)
    expect(progressToPosition(0.25, 5)).toBe(1)
  })
  it('honours a playback range', () => {
    expect(progressToFrame(0.1, 11, [0.2, 0.8])).toBe(0)
    expect(progressToFrame(0.5, 11, [0.2, 0.8])).toBe(5)
    expect(progressToFrame(0.9, 11, [0.2, 0.8])).toBe(10)
  })
  it('returns 0 with no frames', () => {
    expect(progressToFrame(0.5, 0)).toBe(0)
  })
})

describe('pickVariant', () => {
  const variants = [{ width: 1920 }, { width: 640 }, { width: 1280 }]
  it('picks the smallest variant that covers the target', () => {
    expect(pickVariant(variants, 500).width).toBe(640)
    expect(pickVariant(variants, 1000).width).toBe(1280)
  })
  it('falls back to the widest', () => {
    expect(pickVariant(variants, 4000).width).toBe(1920)
  })
})

describe('resolveFrameUrls', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stubFetch = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })))

  it('passes frame arrays through', async () => {
    expect(await resolveFrameUrls({ frames: ['a.webp'] })).toEqual(['a.webp'])
  })
  it('resolves v1 manifests relative to the manifest URL', async () => {
    stubFetch({ version: 1, frames: ['frame_0001.webp', 'frame_0002.webp'] })
    expect(await resolveFrameUrls({ manifest: 'https://cdn.test/hero/manifest.json' })).toEqual([
      'https://cdn.test/hero/frame_0001.webp',
      'https://cdn.test/hero/frame_0002.webp',
    ])
  })
  it('picks the right variant of a v2 manifest', async () => {
    stubFetch({ version: 2, variants: [{ width: 640, dir: '640', frames: ['f1.avif'] }, { width: 1280, dir: '1280', frames: ['f1.avif'] }] })
    expect(await resolveFrameUrls({ manifest: 'https://cdn.test/hero/manifest.json' }, 700)).toEqual(['https://cdn.test/hero/1280/f1.avif'])
    expect(await resolveFrameUrls({ manifest: 'https://cdn.test/hero/manifest.json' }, 390)).toEqual(['https://cdn.test/hero/640/f1.avif'])
  })
  it('turns legacy base64 JSON into data URLs', async () => {
    stubFetch([{ id: 'img_1', img: 'AAAA' }])
    expect(await resolveFrameUrls({ base64Json: '/x.json' })).toEqual(['data:image/jpeg;base64,AAAA'])
  })
  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(resolveFrameUrls({ manifest: 'https://cdn.test/m.json' })).rejects.toThrow('HTTP 404')
  })
})

describe('scrollLength', () => {
  it('prefers pxPerFrame once frames are known', () => {
    expect(scrollLength(100, 14, '300vh')).toBe('1400px')
    expect(scrollLength(0, 14, '300vh')).toBe('300vh')
    expect(scrollLength(0, undefined, 2000)).toBe('2000px')
    expect(scrollLength(0)).toBe('300vh')
  })
})

import { loadOrder } from '../src/core/index'

describe('loadOrder', () => {
  it('starts with the requested frame, then goes coarse to fine', () => {
    const order = loadOrder(40, 21)
    expect(order[0]).toBe(21)
    expect(order.slice(1, 4)).toEqual([0, 16, 32])
    expect(order.indexOf(8)).toBeLessThan(order.indexOf(1))
  })
  it('contains every frame exactly once', () => {
    const order = loadOrder(168, 84)
    expect(order).toHaveLength(168)
    expect(new Set(order).size).toBe(168)
  })
})
