/**
 * Built-in backgrounds, painted procedurally so the app ships no image
 * assets and every one renders crisp at any output size.
 */
export const BUILTIN_BACKGROUNDS = ['studio', 'dawn', 'ocean', 'bokeh', 'mesh', 'paper'] as const
export type BuiltinBackground = (typeof BUILTIN_BACKGROUNDS)[number]

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Deterministic PRNG so a background looks identical on every paint. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

function linear(ctx: Ctx, h: number, stops: [number, string][]): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, ctx.canvas.width, h)
}

const PAINTERS: Record<BuiltinBackground, (ctx: Ctx, w: number, h: number) => void> = {
  // Charcoal backdrop with a soft warm key light, like a portrait studio.
  studio(ctx, w, h) {
    ctx.fillStyle = '#16171c'
    ctx.fillRect(0, 0, w, h)
    radial(ctx, w * 0.62, h * 0.42, w * 0.7, [
      [0, 'rgba(120, 104, 92, 0.85)'],
      [0.45, 'rgba(58, 54, 56, 0.6)'],
      [1, 'rgba(14, 15, 19, 0)'],
    ])
    radial(ctx, w * 0.5, h * 1.25, w * 0.9, [
      [0, 'rgba(0, 0, 0, 0.55)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ])
  },

  // Early-morning sky: peach horizon fading to lavender.
  dawn(ctx, w, h) {
    linear(ctx, h, [
      [0, '#5b5f9c'],
      [0.55, '#c99bb0'],
      [1, '#f4c49a'],
    ])
    radial(ctx, w * 0.78, h * 0.78, h * 0.55, [
      [0, 'rgba(255, 236, 200, 0.95)'],
      [0.25, 'rgba(255, 214, 170, 0.5)'],
      [1, 'rgba(255, 200, 160, 0)'],
    ])
  },

  // Deep teal water with slow, soft light bands.
  ocean(ctx, w, h) {
    linear(ctx, h, [
      [0, '#0b3a4a'],
      [1, '#06192a'],
    ])
    ctx.save()
    ctx.filter = `blur(${Math.round(h * 0.03)}px)`
    ctx.strokeStyle = 'rgba(120, 220, 230, 0.16)'
    ctx.lineWidth = h * 0.035
    for (let band = 0; band < 6; band++) {
      ctx.beginPath()
      const y0 = h * (0.2 + band * 0.14)
      for (let x = -20; x <= w + 20; x += 20) {
        const y = y0 + Math.sin(x / (w * 0.12) + band * 1.3) * h * 0.025
        if (x === -20) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  },

  // Out-of-focus city lights.
  bokeh(ctx, w, h) {
    linear(ctx, h, [
      [0, '#121426'],
      [1, '#1d1430'],
    ])
    const random = rng(7)
    const palette = ['255, 196, 120', '255, 140, 160', '140, 180, 255', '255, 230, 170']
    ctx.save()
    ctx.filter = `blur(${Math.max(1, Math.round(h * 0.008))}px)`
    for (let i = 0; i < 46; i++) {
      const r = h * (0.03 + random() * 0.09)
      const color = palette[Math.floor(random() * palette.length)]
      ctx.fillStyle = `rgba(${color}, ${0.12 + random() * 0.3})`
      ctx.beginPath()
      ctx.arc(random() * w, random() * h * 0.9, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  // Blended colour fields, calm enough to sit behind a face.
  mesh(ctx, w, h) {
    ctx.fillStyle = '#20243a'
    ctx.fillRect(0, 0, w, h)
    const blobs: [number, number, string][] = [
      [0.15, 0.2, 'rgba(92, 116, 255, 0.75)'],
      [0.85, 0.25, 'rgba(255, 112, 168, 0.6)'],
      [0.7, 0.9, 'rgba(255, 176, 92, 0.55)'],
      [0.2, 0.85, 'rgba(64, 200, 190, 0.55)'],
    ]
    for (const [x, y, color] of blobs) {
      radial(ctx, w * x, h * y, w * 0.55, [
        [0, color],
        [1, 'rgba(32, 36, 58, 0)'],
      ])
    }
  },

  // Light, warm neutral wall for bright rooms.
  paper(ctx, w, h) {
    linear(ctx, h, [
      [0, '#e9e4dc'],
      [1, '#d6cfc4'],
    ])
    radial(ctx, w * 0.3, h * 0.25, w * 0.6, [
      [0, 'rgba(255, 252, 245, 0.8)'],
      [1, 'rgba(255, 252, 245, 0)'],
    ])
    // Fine grain stops large flat areas from banding once encoded.
    const random = rng(3)
    ctx.fillStyle = 'rgba(90, 80, 70, 0.05)'
    for (let i = 0; i < (w * h) / 900; i++) ctx.fillRect(random() * w, random() * h, 1.5, 1.5)
  },
}

export function isBuiltin(id: string): id is `builtin:${BuiltinBackground}` {
  return id.startsWith('builtin:') && (BUILTIN_BACKGROUNDS as readonly string[]).includes(id.slice(8))
}

export function paintBuiltin(ctx: Ctx, id: BuiltinBackground, w: number, h: number): void {
  ctx.save()
  PAINTERS[id](ctx, w, h)
  ctx.restore()
}

/** Draws an image scaled to cover the whole area, cropping the overflow. */
export function drawCover(
  ctx: Ctx,
  source: CanvasImageSource & { width: number; height: number },
  w: number,
  h: number,
): void {
  const scale = Math.max(w / source.width, h / source.height)
  const dw = source.width * scale
  const dh = source.height * scale
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh)
}
