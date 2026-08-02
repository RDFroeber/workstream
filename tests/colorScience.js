// Color science for the palette tests. Kept out of src/ deliberately — the app
// has no runtime need for CIEDE2000, so shipping it would be dead weight in the
// bundle. This mirrors the analysis used to design the palette.

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const srgb2lin = (c) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function rgb2xyz([r, g, b]) {
  const [R, G, B] = [srgb2lin(r), srgb2lin(g), srgb2lin(b)]
  return [
    R * 0.4124 + G * 0.3576 + B * 0.1805,
    R * 0.2126 + G * 0.7152 + B * 0.0722,
    R * 0.0193 + G * 0.1192 + B * 0.9505,
  ]
}

function xyz2lab([x, y, z]) {
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x / 0.95047)
  const fy = f(y / 1.0)
  const fz = f(z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export const hex2lab = (h) => xyz2lab(rgb2xyz(hex2rgb(h)))

/** CIEDE2000 — the perceptual difference metric the palette was designed against. */
export function deltaE(l1, l2) {
  const [L1, a1, b1] = l1
  const [L2, a2, b2] = l2
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI
  const H1 = (h1p + 360) % 360
  const H2 = (h2p + 360) % 360
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = H2 - H1
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360)
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = H1 + H2
  if (C1p * C2p !== 0) {
    if (Math.abs(H1 - H2) > 180) hbp += hbp < 360 ? 360 : -360
    hbp /= 2
  }
  const T =
    1 -
    0.17 * Math.cos(((hbp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hbp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hbp - 63) * Math.PI) / 180)
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2))
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh)
  )
}

/** Viénot 1999 dichromat simulation. */
export function simulate(hex, type) {
  const [r, g, b] = hex2rgb(hex).map(srgb2lin)
  let R, G, B
  if (type === 'deuteranopia') {
    R = 0.625 * r + 0.375 * g
    G = 0.7 * r + 0.3 * g
    B = 0.3 * g + 0.7 * b
  } else if (type === 'protanopia') {
    R = 0.567 * r + 0.433 * g
    G = 0.558 * r + 0.442 * g
    B = 0.242 * g + 0.758 * b
  } else {
    R = 0.95 * r + 0.05 * g
    G = 0.433 * g + 0.567 * b
    B = 0.475 * g + 0.525 * b
  }
  const lin2srgb = (c) => {
    c = Math.max(0, Math.min(1, c))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  }
  return [R, G, B].map((c) => Math.round(lin2srgb(c) * 255))
}

export const simLab = (hex, type) => xyz2lab(rgb2xyz(simulate(hex, type)))

export const VISION_TYPES = ['deuteranopia', 'protanopia', 'tritanopia']

/** Worst-case separation between two colors across normal and dichromatic vision. */
export function worstCaseDelta(hexA, hexB) {
  const ds = [deltaE(hex2lab(hexA), hex2lab(hexB))]
  for (const t of VISION_TYPES) ds.push(deltaE(simLab(hexA, t), simLab(hexB, t)))
  return Math.min(...ds)
}

export function relLum(hex) {
  const [r, g, b] = hex2rgb(hex).map(srgb2lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(hex, bg) {
  const l1 = relLum(hex)
  const l2 = relLum(bg)
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (a + 0.05) / (b + 0.05)
}
