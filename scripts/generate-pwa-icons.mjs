// Generates PWA icons from public/logo.png:
//  - icon-192.png / icon-512.png (transparent, "any" purpose)
//  - icon-maskable-512.png (logo at ~65% on white, safe for Android maskable)
//  - apple-touch-icon.png (180x180, flattened onto white — iOS requires opaque)
// Usage: node scripts/generate-pwa-icons.mjs

import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const src = 'public/logo.png'

await sharp(src).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile('public/icons/icon-192.png')

await sharp(src).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile('public/icons/icon-512.png')

// Maskable: Android crops up to ~20% from each edge, so shrink the logo onto a canvas
const inner = await sharp(src)
  .resize(332, 332, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .composite([{ input: inner, gravity: 'center' }])
  .png().toFile('public/icons/icon-maskable-512.png')

await sharp(src)
  .resize(150, 150, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .png().toFile('public/icons/apple-touch-icon.png')

console.log('✓ Icons written to public/icons/')
