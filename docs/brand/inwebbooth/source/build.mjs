// Bangun set logo InWebBooth dengan format yang sama dengan keluarga InWeb (docs/brand/four-batches-inkfix-2026-10-02):
// simbol #0B5FFF di kedua tema, wordmark Plus Jakarta Sans 700 #14181F (terang) / #FFFFFF (gelap).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import opentype from 'opentype.js'
import pngToIco from 'png-to-ico'
import { marks, BLUE } from './marks.mjs'

const sharp = createRequire('C:/WORK/github/photoboots/package.json')('sharp')
const OUT = process.argv[2]
const NAME = 'InWebBooth'
const INK = { light: '#14181F', dark: '#FFFFFF' }
const font = opentype.parse(
  new Uint8Array(fs.readFileSync('node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff')).buffer,
)
const markInner = marks.A()

// Simbol diletakkan di kotak (x, y, s); id mask unik per pemakaian.
const place = (x, y, s, id, color = BLUE) =>
  `<g transform="translate(${x} ${y}) scale(${s / 512})">${markInner.replaceAll('id="m"', `id="${id}"`).replace('url(#m)', `url(#${id})`).replace(BLUE, color)}</g>`

function word(size) {
  const p = font.getPath(NAME, 0, 0, size, { kerning: true })
  const b = p.getBoundingBox()
  return { d: p.toPathData(2), w: b.x2 - b.x1, x1: b.x1, cap: (font.tables.os2.sCapHeight / font.unitsPerEm) * size, desc: b.y2 }
}

const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`

// Horizontal: simbol setinggi kanvas, cap height wordmark ±40% simbol (sama dengan InWebAsset).
function horizontal(theme) {
  const H = 116, m = 100, gap = 18
  const t = word(m * 0.4 / 0.72)
  const tx = 8 + m + gap - t.x1, base = H / 2 + t.cap / 2
  const W = Math.ceil(8 + m + gap + t.w + 8)
  return wrap(W, H, place(8, 8, m, 'h') + `<path transform="translate(${tx} ${base})" d="${t.d}" fill="${INK[theme]}"/>`)
}

function stacked(theme) {
  const S = 384, m = 210
  const t = word(56)
  const scale = Math.min(1, 300 / t.w)
  const blockH = m + 22 + t.cap * scale, top = (S - blockH) / 2
  const tx = (S - t.w * scale) / 2 - t.x1 * scale
  return wrap(S, S, place((S - m) / 2, top, m, 's') +
    `<path transform="translate(${tx} ${top + m + 22 + t.cap * scale}) scale(${scale})" d="${t.d}" fill="${INK[theme]}"/>`)
}

const mark = (color = BLUE) => wrap(512, 512, place(0, 0, 512, 'k', color))

const comp = path.join(OUT, 'components'), ready = path.join(OUT, 'ready')
fs.mkdirSync(comp, { recursive: true })
fs.mkdirSync(ready, { recursive: true })

const svgs = {
  'logo-horizontal-light': horizontal('light'),
  'logo-horizontal-dark': horizontal('dark'),
  'logo-stacked-light': stacked('light'),
  'logo-stacked-dark': stacked('dark'),
  'mark-blue': mark(),
  'mark-white': mark('#FFFFFF'),
}
const out = async (name, svg, width) => {
  fs.writeFileSync(path.join(comp, name + '.svg'), svg)
  const img = sharp(Buffer.from(svg), { density: 288 }).resize({ width })
  await img.clone().png().toFile(path.join(ready, name + '.png'))
  await img.clone().webp({ quality: 92 }).toFile(path.join(ready, name + '.webp'))
}
for (const [n, s] of Object.entries(svgs)) await out(n, s, n.startsWith('logo-horizontal') ? Number(s.match(/width="(\d+)"/)[1]) : n.startsWith('mark') ? 512 : 384)
// Alias seperti keluarga InWeb: logo-stacked = versi terang, mark-color = mark-blue.
for (const ext of ['png', 'webp']) {
  fs.copyFileSync(path.join(ready, `logo-stacked-light.${ext}`), path.join(ready, `logo-stacked.${ext}`))
  fs.copyFileSync(path.join(ready, `mark-blue.${ext}`), path.join(ready, `mark-color.${ext}`))
}
const icons = {}
for (const s of [16, 32, 48, 180, 192, 512]) {
  icons[s] = await sharp(Buffer.from(svgs['mark-blue']), { density: 288 }).resize(s).png().toBuffer()
  fs.writeFileSync(path.join(ready, `icon-${s}.png`), icons[s])
}
fs.writeFileSync(path.join(ready, 'favicon.ico'), await pngToIco([icons[16], icons[32], icons[48]]))
fs.writeFileSync(path.join(ready, 'favicon.svg'), svgs['mark-blue'])

// review.png 960×780: kiri terang, kanan gelap; baris horizontal, stacked, mark (format review keluarga InWeb).
const png = (svg, w) => sharp(Buffer.from(svg), { density: 288 }).resize({ width: w }).png().toBuffer()
const hw = 420, hh = Math.round(hw * 116 / Number(svgs['logo-horizontal-light'].match(/width="(\d+)"/)[1]))
const layers = [
  { input: { create: { width: 480, height: 780, channels: 4, background: '#FBFAF8' } }, left: 0, top: 0 },
  { input: { create: { width: 480, height: 780, channels: 4, background: '#0D1117' } }, left: 480, top: 0 },
]
for (const [i, th] of ['light', 'dark'].entries()) {
  const ox = i * 480
  layers.push({ input: await png(svgs[`logo-horizontal-${th}`], hw), left: ox + 30, top: 130 - Math.round(hh / 2) })
  layers.push({ input: await png(svgs[`logo-stacked-${th}`], 260), left: ox + 110, top: 250 })
  layers.push({ input: await png(svgs['mark-blue'], 230), left: ox + 125, top: 530 })
}
await sharp({ create: { width: 960, height: 780, channels: 4, background: '#fff' } }).composite(layers).png().toFile(path.join(OUT, 'review.png'))

fs.writeFileSync(path.join(OUT, 'brief.json'), JSON.stringify({
  name: NAME, slug: 'inwebbooth', repo: 'C:/WORK/github/photoboots', font: 'Plus Jakarta Sans', weight: 700,
  source: 'docs/design.md: wordmark', concept: 'Kamera dengan strip foto 2 frame keluar dari atas; lensa, jendela bidik, dan lampu kilat sebagai potongan transparan',
  variants: Object.keys(svgs), symbolColor: '#0B5FFF in both themes', wordmark: INK,
  generator: 'build.mjs (SVG kode + opentype.js), bukan generate AI', status: 'Draft, dipasang di repo photoboots',
}, null, 2))
console.log('ok', fs.readdirSync(ready).length, 'files in ready/')
