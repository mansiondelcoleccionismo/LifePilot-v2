// Generates public/icon-192.png and public/icon-512.png
// White Zap lightning bolt on #1A4FC4 blue background with rounded corners
// Pure Node.js — no external dependencies
'use strict'

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── CRC32 ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── PNG encoding ───────────────────────────────────────────────────────────

function u32be(n) {
  const b = Buffer.allocUnsafe(4)
  b.writeUInt32BE(n, 0)
  return b
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const crcInput  = Buffer.concat([typeBytes, data])
  return Buffer.concat([u32be(data.length), typeBytes, data, u32be(crc32(crcInput))])
}

function encodePNG(width, height, rgba) {
  // IHDR
  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(width,  0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8]  = 8  // bit depth
  ihdrData[9]  = 2  // colour type = truecolour (no alpha — wait, we need alpha for rounded corners)
  // Use colour type 6 (RGBA)
  ihdrData[9]  = 6
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace

  // Raw image data: filter byte 0 before each scanline
  const raw = Buffer.allocUnsafe(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter type None
    for (let x = 0; x < width; x++) {
      const dst = y * (1 + width * 4) + 1 + x * 4
      const src = (y * width + x) * 4
      raw[dst]     = rgba[src]
      raw[dst + 1] = rgba[src + 1]
      raw[dst + 2] = rgba[src + 2]
      raw[dst + 3] = rgba[src + 3]
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = chunk('IHDR', ihdrData)
  const idat = chunk('IDAT', compressed)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, ihdr, idat, iend])
}

// ── Drawing helpers ────────────────────────────────────────────────────────

function setPixel(buf, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w || y >= w) return
  const i = (y * w + x) * 4
  // Alpha blend over existing
  const sa = a / 255
  const da = buf[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa === 0) return
  buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa)
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa)
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa)
  buf[i + 3] = Math.round(oa * 255)
}

// Fill rounded rectangle
function fillRoundedRect(buf, size, x0, y0, x1, y1, r, R, G, B, A) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Distance to nearest corner centre
      const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
      const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= r) {
        // Anti-alias at edge
        const alpha = dist > r - 1 ? Math.round(A * (r - dist)) : A
        setPixel(buf, size, x, y, R, G, B, Math.min(255, alpha))
      }
    }
  }
}

// Fill convex polygon using scanline
function fillPolygon(buf, size, pts, R, G, B, A) {
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y }

  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = []
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[(i + 1) % n]
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k < xs.length - 1; k += 2) {
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) {
        setPixel(buf, size, x, y, R, G, B, A)
      }
    }
  }
}

// ── Icon generator ─────────────────────────────────────────────────────────

// Lucide Zap viewBox 0 0 24 24 points (approximate polygon from the SVG path)
// path d="M13 2L3 14h9l-1 8L21 10h-9l1-8z"
// We convert to a polygon: top of bolt, right arm, bottom of bolt, left arm
const ZAP_POLY_24 = [
  [13, 2],
  [3, 14],
  [12, 14],
  [11, 22],
  [21, 10],
  [12, 10],
]

function generateIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0) // transparent

  // Background: rounded rectangle
  const r = Math.round(size * 0.22) // ~22% radius for iOS-style rounding
  fillRoundedRect(buf, size, 0, 0, size - 1, size - 1, r, 0x1A, 0x4F, 0xC4, 255)

  // Scale Zap from 24×24 to fit within icon with padding
  const pad = size * 0.15
  const scale = (size - pad * 2) / 24

  const pts = ZAP_POLY_24.map(([x, y]) => [
    Math.round(pad + x * scale),
    Math.round(pad + y * scale),
  ])

  fillPolygon(buf, size, pts, 255, 255, 255, 255)

  return encodePNG(size, size, buf)
}

// ── Main ──────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'public')

for (const size of [192, 512]) {
  const png  = generateIcon(size)
  const file = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(file, png)
  console.log(`✓ ${file} (${png.length} bytes)`)
}
