import type { Spacing } from './layouts'

/**
 * Template frame digambar sepenuhnya oleh kode (pola, warna, bentuk slot), jadi tidak ada
 * berkas gambar frame yang perlu diunduh. Hiasan opsional memakai sprinkle InWebAsset (CDN, CORS terbuka).
 */

export type Pattern =
  | 'none'
  | 'dots'
  | 'stripes'
  | 'diagonal'
  | 'checker'
  | 'gingham'
  | 'grid'
  | 'hearts'
  | 'stars'
  | 'waves'
  | 'zigzag'
  | 'confetti'
  | 'film'
  | 'sparkles'
  | 'clouds'
  | 'flowers'
  | 'noise'
  | 'sunburst'

export type SlotStyle = 'plain' | 'polaroid' | 'tape' | 'stamp' | 'arch' | 'film' | 'ticket'

export type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'fl' | 'fr' | 'fc' | 'hc'

export interface Decor {
  src: string
  anchor: Anchor
  /** Ukuran (px pada region selebar 600). */
  size: number
  dx?: number
  dy?: number
  rot?: number
}

export interface Template {
  id: string
  name: string
  category: Category
  bg: {
    color: string
    /** Latar bergambar (berkas public/frames/<image>.webp, dipotong menutupi region). */
    image?: string
    /** Warna kedua untuk gradien vertikal/diagonal. */
    color2?: string
    angle?: number
    pattern?: Pattern
    patternColor?: string
    patternScale?: number
    patternAlpha?: number
  }
  spacing: Spacing
  slot: {
    style: SlotStyle
    radius: number
    border: number
    borderColor: string
    shadow?: boolean
  }
  text: {
    font: string
    weight?: string
    size: number
    color: string
    default: string
    /** Huruf kapital & jarak antar huruf, gaya label strip klasik. */
    caps?: boolean
    tracking?: number
    /** Warna pelat di belakang tulisan (untuk latar berpola ramai). */
    plate?: string
  }
  /** Teks kecil di header (opsional), mis. "photobooth" di atas strip. */
  header?: { text: string; font: string; size: number; color: string }
  decor?: Decor[]
}

export const CATEGORIES = ['Simpel', 'Pastel', 'Lucu', 'Retro', 'Elegan', 'Gelap', 'Musiman', 'Pola'] as const
export type Category = (typeof CATEGORIES)[number]

const CDN = 'https://inassetweb-cdn.inwebsite.online/sprinkles/v2/'
export const sp = (path: string) => `${CDN}${path}.webp`

const SP_STRIP: Spacing = { pad: 34, gap: 22, header: 0, footer: 190 }
const SP_TIGHT: Spacing = { pad: 26, gap: 16, header: 0, footer: 170 }
const SP_HEADER: Spacing = { pad: 34, gap: 22, header: 70, footer: 160 }
const SP_POLA: Spacing = { pad: 40, gap: 26, header: 0, footer: 200 }

const plain = (radius = 0, border = 0, borderColor = '#ffffff', shadow = false) =>
  ({ style: 'plain', radius, border, borderColor, shadow }) as Template['slot']

const text = (
  font: string,
  color: string,
  size = 54,
  def = 'photobooth',
  extra: Partial<Template['text']> = {},
): Template['text'] => ({ font, color, size, default: def, ...extra })

const BASE: Template[] = [
  // ---------------------------------------------------------------- Simpel
  { id: 'putih', name: 'Putih Bersih', category: 'Simpel', bg: { color: '#ffffff' }, spacing: SP_STRIP, slot: plain(), text: text('Plus Jakarta Sans', '#1f1a17', 34, 'photobooth', { caps: true, tracking: 10, weight: '700' }) },
  { id: 'hitam', name: 'Hitam Klasik', category: 'Simpel', bg: { color: '#141414' }, spacing: SP_STRIP, slot: plain(), text: text('Plus Jakarta Sans', '#f5f0e8', 34, 'photobooth', { caps: true, tracking: 10, weight: '700' }) },
  { id: 'krem', name: 'Krem', category: 'Simpel', bg: { color: '#f3e9d7' }, spacing: SP_STRIP, slot: plain(6), text: text('DM Serif Display', '#3b2f25', 52, 'our little moment') },
  { id: 'abu', name: 'Abu Studio', category: 'Simpel', bg: { color: '#d9d9d6' }, spacing: SP_STRIP, slot: plain(0, 6, '#ffffff'), text: text('Space Mono', '#222222', 32, 'PHOTO STUDIO', { tracking: 6 }) },
  { id: 'merah', name: 'Merah Booth', category: 'Simpel', bg: { color: '#d62839' }, spacing: SP_STRIP, slot: plain(0, 8, '#ffffff'), text: text('Bebas Neue', '#ffffff', 84, 'PHOTOBOOTH', { tracking: 6 }) },
  { id: 'navy', name: 'Navy', category: 'Simpel', bg: { color: '#1b2a4a' }, spacing: SP_STRIP, slot: plain(4), text: text('DM Serif Display', '#f2d49b', 54, 'good times') },
  { id: 'kertas', name: 'Kertas Foto', category: 'Simpel', bg: { color: '#faf7f0', pattern: 'noise', patternColor: '#000000', patternAlpha: 0.05 }, spacing: SP_TIGHT, slot: plain(0), text: text('Caveat', '#2a2a2a', 64, 'kenangan hari ini') },
  { id: 'polaroid', name: 'Polaroid', category: 'Simpel', bg: { color: '#efece6' }, spacing: SP_STRIP, slot: { style: 'polaroid', radius: 2, border: 14, borderColor: '#ffffff', shadow: true }, text: text('Caveat', '#333333', 60, 'say cheese!') },

  // ---------------------------------------------------------------- Pastel
  { id: 'pink-susu', name: 'Pink Susu', category: 'Pastel', bg: { color: '#ffd6e0' }, spacing: SP_STRIP, slot: plain(18, 8, '#ffffff'), text: text('Fredoka', '#d6336c', 58, 'besties ♡', { weight: '700' }), decor: [{ src: sp('stickers/kawaii-star'), anchor: 'fl', size: 110, rot: -12 }, { src: sp('particles/heart3d-classic'), anchor: 'fr', size: 90, rot: 10 }] },
  { id: 'lilac', name: 'Lilac', category: 'Pastel', bg: { color: '#e4d9ff', color2: '#ffe1f2', angle: 160 }, spacing: SP_STRIP, slot: plain(24), text: text('Fredoka', '#6741d9', 56, 'dreamy day', { weight: '600' }), decor: [{ src: sp('stickers/kawaii-moon'), anchor: 'fr', size: 110, rot: 8 }, { src: sp('particles/sparkle-4point'), anchor: 'fl', size: 70 }] },
  { id: 'mint', name: 'Mint', category: 'Pastel', bg: { color: '#c9f2e3' }, spacing: SP_STRIP, slot: plain(14, 8, '#ffffff'), text: text('Baloo 2', '#13795b', 58, 'fresh & fun', { weight: '800' }), decor: [{ src: sp('stickers/kawaii-cloud'), anchor: 'fl', size: 120 }] },
  { id: 'peach', name: 'Peach', category: 'Pastel', bg: { color: '#ffe0cc', color2: '#ffd1dc', angle: 180 }, spacing: SP_STRIP, slot: { style: 'arch', radius: 0, border: 0, borderColor: '#fff' }, text: text('Dancing Script', '#b4532a', 64, 'sweet memories') },
  { id: 'baby-blue', name: 'Baby Blue', category: 'Pastel', bg: { color: '#d3ecff', pattern: 'clouds', patternColor: '#ffffff', patternAlpha: 0.9 }, spacing: SP_STRIP, slot: plain(16, 8, '#ffffff'), text: text('Fredoka', '#1971c2', 56, 'cloud nine', { weight: '700' }), decor: [{ src: sp('stickers/kawaii-rainbow'), anchor: 'fr', size: 120, rot: 6 }] },
  { id: 'butter', name: 'Butter', category: 'Pastel', bg: { color: '#fff3bf', pattern: 'dots', patternColor: '#ffffff', patternScale: 1.2 }, spacing: SP_STRIP, slot: plain(20, 8, '#ffffff'), text: text('Baloo 2', '#e67700', 58, 'hello sunshine', { weight: '800' }), decor: [{ src: sp('weather/clay-sun'), anchor: 'fl', size: 120 }] },
  { id: 'gula-kapas', name: 'Gula Kapas', category: 'Pastel', bg: { color: '#ffc8dd', color2: '#bde0fe', angle: 90 }, spacing: SP_STRIP, slot: plain(22, 0), text: text('Pacifico', '#c9184a', 52, 'so sweet') },

  // ---------------------------------------------------------------- Lucu
  { id: 'kawaii', name: 'Kawaii', category: 'Lucu', bg: { color: '#fff0f6', pattern: 'hearts', patternColor: '#ffb3cf', patternAlpha: 0.6 }, spacing: SP_STRIP, slot: plain(20, 8, '#ffffff', true), text: text('Fredoka', '#e64980', 58, 'cutie pie', { weight: '700' }), decor: [{ src: sp('stickers/kawaii-camera'), anchor: 'fl', size: 120, rot: -10 }, { src: sp('stickers/kawaii-star'), anchor: 'tr', size: 90, dx: 12, dy: -6, rot: 14 }] },
  { id: 'bintang', name: 'Bintang Kecil', category: 'Lucu', bg: { color: '#2b2d6e', pattern: 'stars', patternColor: '#ffe066', patternAlpha: 0.85 }, spacing: SP_STRIP, slot: plain(14, 6, '#ffe066'), text: text('Fredoka', '#ffe066', 56, 'twinkle twinkle', { weight: '700' }), decor: [{ src: sp('stickers/kawaii-moon'), anchor: 'fr', size: 120 }] },
  { id: 'konfeti', name: 'Konfeti', category: 'Lucu', bg: { color: '#ffffff', pattern: 'confetti' }, spacing: SP_STRIP, slot: plain(12, 6, '#1f1a17'), text: text('Baloo 2', '#1f1a17', 60, "let's party!", { weight: '800' }), decor: [{ src: sp('effects/confetti'), anchor: 'fr', size: 120 }] },
  { id: 'pelangi', name: 'Pelangi', category: 'Lucu', bg: { color: '#ff9aa2', color2: '#b5ead7', angle: 180 }, spacing: SP_STRIP, slot: plain(18, 8, '#ffffff'), text: text('Fredoka', '#7b2cbf', 60, 'good vibes', { weight: '700' }), decor: [{ src: sp('stickers/kawaii-rainbow'), anchor: 'fc', size: 120, dy: -40 }] },
  { id: 'doodle', name: 'Doodle', category: 'Lucu', bg: { color: '#fffdf5', pattern: 'sparkles', patternColor: '#1f1a17', patternAlpha: 0.25 }, spacing: SP_STRIP, slot: plain(10, 5, '#1f1a17'), text: text('Permanent Marker', '#1f1a17', 52, 'bestie squad'), decor: [{ src: sp('stickers/arrow'), anchor: 'fl', size: 100, rot: -20 }] },
  { id: 'luar-angkasa', name: 'Luar Angkasa', category: 'Lucu', bg: { color: '#0b1d3a', color2: '#3a0ca3', angle: 180, pattern: 'stars', patternColor: '#ffffff', patternAlpha: 0.7, patternScale: 0.7 }, spacing: SP_STRIP, slot: plain(100, 6, '#ffffff'), text: text('Fredoka', '#ffffff', 54, 'out of this world', { weight: '700' }), decor: [{ src: sp('space/flat-rocket'), anchor: 'fr', size: 120, rot: 20 }] },
  { id: 'kebun', name: 'Kebun Bunga', category: 'Lucu', bg: { color: '#e9f5db', pattern: 'flowers', patternColor: '#ffffff', patternAlpha: 0.9 }, spacing: SP_STRIP, slot: plain(16, 8, '#ffffff'), text: text('Fredoka', '#386641', 56, 'bloom together', { weight: '700' }), decor: [{ src: sp('nature/flower-daisy'), anchor: 'fl', size: 110 }] },

  // ---------------------------------------------------------------- Retro
  { id: 'film-hitam', name: 'Rol Film', category: 'Retro', bg: { color: '#121212', pattern: 'film', patternColor: '#f2f2f2' }, spacing: { pad: 70, gap: 30, header: 0, footer: 150 }, slot: plain(0), text: text('Space Mono', '#f2a541', 30, 'KODAK 400 · ISO', { tracking: 4 }) },
  { id: 'film-cokelat', name: 'Film Sepia', category: 'Retro', bg: { color: '#3a2a1d', pattern: 'film', patternColor: '#e9d8bd' }, spacing: { pad: 70, gap: 30, header: 0, footer: 150 }, slot: plain(0), text: text('Space Mono', '#e9d8bd', 30, 'NO. 024 · 36 EXP', { tracking: 4 }) },
  { id: 'seventies', name: '70-an', category: 'Retro', bg: { color: '#f4a259', pattern: 'waves', patternColor: '#bc4b51', patternAlpha: 0.9 }, spacing: SP_STRIP, slot: plain(26, 8, '#fef3dd'), text: text('Bebas Neue', '#fef3dd', 76, 'GROOVY BABY', { tracking: 4 }), decor: [{ src: sp('stickers/retro-flower'), anchor: 'fr', size: 120 }] },
  { id: 'memphis', name: 'Memphis', category: 'Retro', bg: { color: '#fdf0d5', pattern: 'zigzag', patternColor: '#3a86ff', patternAlpha: 0.5 }, spacing: SP_STRIP, slot: plain(0, 8, '#1f1a17'), text: text('Bebas Neue', '#ff006e', 80, 'RAD TIMES', { tracking: 5, plate: '#fdf0d5' }), decor: [{ src: sp('shapes/memphis-zigzag'), anchor: 'fl', size: 110 }] },
  { id: 'arcade', name: 'Arcade', category: 'Retro', bg: { color: '#1a1033', pattern: 'grid', patternColor: '#ff4ecd', patternAlpha: 0.35 }, spacing: SP_STRIP, slot: plain(0, 6, '#00f5d4'), text: text('Press Start 2P', '#00f5d4', 26, 'PLAYER 1 READY'), decor: [{ src: sp('pixel/heart'), anchor: 'fr', size: 70 }] },
  { id: 'gingham-merah', name: 'Piknik', category: 'Retro', bg: { color: '#ffffff', pattern: 'gingham', patternColor: '#e63946', patternAlpha: 0.55 }, spacing: SP_STRIP, slot: plain(6, 10, '#ffffff', true), text: text('Pacifico', '#c1121f', 50, 'picnic date', { plate: '#ffffff' }) },
  { id: 'tiket', name: 'Tiket Bioskop', category: 'Retro', bg: { color: '#f1e3c6' }, spacing: SP_STRIP, slot: { style: 'ticket', radius: 0, border: 0, borderColor: '#f1e3c6' }, text: text('Bebas Neue', '#8d0801', 70, 'ADMIT ONE', { tracking: 8 }) },
  { id: 'sunburst', name: 'Sunburst', category: 'Retro', bg: { color: '#ffbe0b', pattern: 'sunburst', patternColor: '#fb5607', patternAlpha: 0.35 }, spacing: SP_STRIP, slot: plain(10, 8, '#ffffff'), text: text('Bebas Neue', '#ffffff', 80, 'SUNNY DAYS', { tracking: 4 }) },

  // ---------------------------------------------------------------- Elegan
  { id: 'emas', name: 'Hitam Emas', category: 'Elegan', bg: { color: '#0f0f0f' }, spacing: SP_HEADER, slot: plain(0, 3, '#c9a227'), header: { text: '— our day —', font: 'DM Serif Display', size: 30, color: '#c9a227' }, text: text('Dancing Script', '#c9a227', 62, 'forever & always'), decor: [{ src: sp('lines/ornament-flourish'), anchor: 'fc', size: 200, dy: 30 }] },
  { id: 'wedding', name: 'Wedding', category: 'Elegan', bg: { color: '#fbf8f3' }, spacing: SP_HEADER, slot: { style: 'arch', radius: 0, border: 0, borderColor: '#fff' }, header: { text: 'the wedding of', font: 'DM Serif Display', size: 28, color: '#8a7967' }, text: text('Dancing Script', '#5e503f', 64, 'Nama & Nama'), decor: [{ src: sp('nature/wc-rose'), anchor: 'fl', size: 120, rot: -10 }] },
  { id: 'sage', name: 'Sage', category: 'Elegan', bg: { color: '#dde5d4' }, spacing: SP_STRIP, slot: plain(4, 0), text: text('DM Serif Display', '#3f4f3a', 48, 'slow moments') },
  { id: 'marmer', name: 'Marmer', category: 'Elegan', bg: { color: '#f4f1ee', color2: '#e1dcd6', angle: 135, pattern: 'noise', patternColor: '#6c6c6c', patternAlpha: 0.08 }, spacing: SP_STRIP, slot: plain(2, 4, '#c8b38a'), text: text('DM Serif Display', '#4a3f35', 50, 'timeless') },
  { id: 'burgundy', name: 'Burgundy', category: 'Elegan', bg: { color: '#5c0f1f' }, spacing: SP_STRIP, slot: plain(0, 4, '#f3dfc1'), text: text('Dancing Script', '#f3dfc1', 64, 'with love') },
  { id: 'laurel', name: 'Laurel', category: 'Elegan', bg: { color: '#fffaf0' }, spacing: SP_STRIP, slot: plain(0, 2, '#b08d57'), text: text('DM Serif Display', '#7a5c2e', 46, 'graduation day'), decor: [{ src: sp('badges/laurel-wreath'), anchor: 'fc', size: 170, dy: -10 }] },

  // ---------------------------------------------------------------- Gelap
  { id: 'neon-pink', name: 'Neon Pink', category: 'Gelap', bg: { color: '#0d0221' }, spacing: SP_STRIP, slot: plain(14, 5, '#ff2a6d', true), text: text('Pacifico', '#ff2a6d', 52, 'night out'), decor: [{ src: sp('icons/neon-heart'), anchor: 'fr', size: 100 }] },
  { id: 'neon-cyan', name: 'Neon Cyan', category: 'Gelap', bg: { color: '#05080f', pattern: 'grid', patternColor: '#05d9e8', patternAlpha: 0.18 }, spacing: SP_STRIP, slot: plain(6, 4, '#05d9e8'), text: text('Bebas Neue', '#05d9e8', 76, 'AFTER HOURS', { tracking: 6 }) },
  { id: 'malam', name: 'Malam', category: 'Gelap', bg: { color: '#1b1b2f', color2: '#16213e', angle: 180, pattern: 'stars', patternColor: '#ffffff', patternAlpha: 0.5, patternScale: 0.6 }, spacing: SP_STRIP, slot: plain(10), text: text('DM Serif Display', '#e0e0ff', 50, 'midnight talks') },
  { id: 'grunge', name: 'Grunge', category: 'Gelap', bg: { color: '#222222', pattern: 'noise', patternColor: '#ffffff', patternAlpha: 0.12 }, spacing: SP_TIGHT, slot: plain(0), text: text('Permanent Marker', '#f1f1f1', 52, 'stay weird') },

  // ---------------------------------------------------------------- Musiman
  { id: 'lebaran', name: 'Lebaran', category: 'Musiman', bg: { color: '#0b5d3b', pattern: 'stars', patternColor: '#f2c14e', patternAlpha: 0.5, patternScale: 0.8 }, spacing: SP_STRIP, slot: plain(14, 6, '#f2c14e'), text: text('DM Serif Display', '#f2c14e', 46, 'Selamat Idulfitri'), decor: [{ src: sp('seasonal/ramadan-lantern'), anchor: 'fr', size: 130 }] },
  { id: 'merdeka', name: 'Merdeka', category: 'Musiman', bg: { color: '#ffffff', color2: '#ffe3e3', angle: 180, pattern: 'stripes', patternColor: '#e03131', patternAlpha: 0.12 }, spacing: SP_STRIP, slot: plain(8, 8, '#e03131'), text: text('Bebas Neue', '#c92a2a', 80, 'MERDEKA!', { tracking: 5 }), decor: [{ src: sp('seasonal/merdeka-flag'), anchor: 'fr', size: 120, rot: 8 }] },
  { id: 'natal', name: 'Natal', category: 'Musiman', bg: { color: '#1e5631', pattern: 'gingham', patternColor: '#c1121f', patternAlpha: 0.35 }, spacing: SP_STRIP, slot: plain(10, 8, '#ffffff'), text: text('Dancing Script', '#ffffff', 60, 'Merry Christmas'), decor: [{ src: sp('seasonal/xmas-tree'), anchor: 'fl', size: 130 }] },
  { id: 'imlek', name: 'Imlek', category: 'Musiman', bg: { color: '#b5121b', pattern: 'waves', patternColor: '#f6c90e', patternAlpha: 0.25 }, spacing: SP_STRIP, slot: plain(10, 6, '#f6c90e'), text: text('DM Serif Display', '#f6c90e', 46, 'Gong Xi Fa Cai'), decor: [{ src: sp('seasonal/imlek-lantern'), anchor: 'fr', size: 130 }] },
  { id: 'valentine', name: 'Valentine', category: 'Musiman', bg: { color: '#ffccd5', pattern: 'hearts', patternColor: '#ff4d6d', patternAlpha: 0.35 }, spacing: SP_STRIP, slot: plain(100, 8, '#ffffff'), text: text('Pacifico', '#c9184a', 52, 'be mine'), decor: [{ src: sp('seasonal/love-heart'), anchor: 'fl', size: 120, rot: -10 }] },
  { id: 'halloween', name: 'Halloween', category: 'Musiman', bg: { color: '#1a1a1a', pattern: 'diagonal', patternColor: '#ff7518', patternAlpha: 0.2 }, spacing: SP_STRIP, slot: plain(8, 6, '#ff7518'), text: text('Permanent Marker', '#ff7518', 56, 'trick or treat'), decor: [{ src: sp('seasonal/halloween-ghost'), anchor: 'fr', size: 120 }] },
  { id: 'ultah', name: 'Ulang Tahun', category: 'Musiman', bg: { color: '#fff4e6', pattern: 'confetti' }, spacing: SP_HEADER, slot: plain(16, 8, '#ffffff', true), header: { text: '★ happy birthday ★', font: 'Fredoka', size: 34, color: '#f76707' }, text: text('Baloo 2', '#f76707', 56, 'Nama 17th', { weight: '800' }), decor: [{ src: sp('particles/confetti-strip'), anchor: 'fr', size: 110 }] },
  { id: 'wisuda', name: 'Wisuda', category: 'Musiman', bg: { color: '#14213d', pattern: 'diagonal', patternColor: '#fca311', patternAlpha: 0.12 }, spacing: SP_STRIP, slot: plain(4, 4, '#fca311'), text: text('Bebas Neue', '#fca311', 74, 'CLASS OF 2026', { tracking: 4 }) },

  // ---------------------------------------------------------------- Pola
  { id: 'polkadot', name: 'Polkadot', category: 'Pola', bg: { color: '#ff595e', pattern: 'dots', patternColor: '#ffffff', patternAlpha: 0.9 }, spacing: SP_POLA, slot: plain(18, 8, '#ffffff'), text: text('Fredoka', '#ff595e', 58, 'dotty day', { weight: '700', plate: '#ffffff' }) },
  { id: 'garis', name: 'Garis Permen', category: 'Pola', bg: { color: '#ffffff', pattern: 'stripes', patternColor: '#4dabf7', patternAlpha: 0.6 }, spacing: SP_POLA, slot: plain(8, 10, '#ffffff', true), text: text('Baloo 2', '#1864ab', 58, 'stripe it up', { weight: '800', plate: '#ffffff' }) },
  { id: 'catur', name: 'Papan Catur', category: 'Pola', bg: { color: '#ffffff', pattern: 'checker', patternColor: '#1f1a17', patternAlpha: 0.9 }, spacing: SP_POLA, slot: plain(0, 10, '#ffffff'), text: text('Bebas Neue', '#1f1a17', 80, 'CHECK MATE', { tracking: 5, plate: '#ffffff' }) },
  { id: 'catur-pastel', name: 'Catur Pastel', category: 'Pola', bg: { color: '#fdf6ff', pattern: 'checker', patternColor: '#cdb4db', patternAlpha: 0.8 }, spacing: SP_POLA, slot: plain(16, 10, '#ffffff'), text: text('Fredoka', '#6a4c93', 56, 'soft era', { weight: '700', plate: '#fdf6ff' }) },
  { id: 'gingham-biru', name: 'Gingham Biru', category: 'Pola', bg: { color: '#ffffff', pattern: 'gingham', patternColor: '#4c6ef5', patternAlpha: 0.45 }, spacing: SP_POLA, slot: plain(10, 10, '#ffffff'), text: text('Caveat', '#364fc7', 64, 'weekend mood', { plate: '#ffffff' }) },
  { id: 'scrapbook', name: 'Scrapbook', category: 'Pola', bg: { color: '#f5ebe0', pattern: 'grid', patternColor: '#a98467', patternAlpha: 0.25 }, spacing: SP_STRIP, slot: { style: 'tape', radius: 0, border: 10, borderColor: '#ffffff', shadow: true }, text: text('Caveat', '#6c584c', 64, 'dear diary'), decor: [{ src: sp('paper/stamp-flower'), anchor: 'fr', size: 110, rot: 8 }] },
  { id: 'perangko', name: 'Perangko', category: 'Pola', bg: { color: '#e9edc9' }, spacing: SP_STRIP, slot: { style: 'stamp', radius: 0, border: 16, borderColor: '#ffffff', shadow: true }, text: text('DM Serif Display', '#606c38', 48, 'greetings from') },
]

// ---------------------------------------------------------------- Ilustrasi (latar hasil generate Codex, public/frames)

/** Slot & tulisan untuk latar bergambar: bingkai putih + bayangan dan pelat di belakang tulisan supaya tetap terbaca. */
const ART_SLOT: Template['slot'] = { style: 'plain', radius: 12, border: 10, borderColor: '#ffffff', shadow: true }
const SP_ART: Spacing = { pad: 50, gap: 26, header: 0, footer: 200 }

/** Template lama yang latarnya diganti ilustrasi (id tetap, jadi pilihan pengguna tidak berubah). */
const UPGRADES: Record<string, { image: string; color: string; plate: string; text?: Partial<Template['text']>; slot?: Template['slot'] }> = {
  wedding: { image: 'watercolor-roses', color: '#f6efe3', plate: '#fffaf2', slot: { style: 'arch', radius: 0, border: 0, borderColor: '#fff' } },
  kawaii: { image: 'kawaii-doodle', color: '#ffe3ee', plate: '#ffffff' },
  'baby-blue': { image: 'cloud-sky', color: '#d3ecff', plate: '#ffffff' },
  'luar-angkasa': { image: 'galaxy', color: '#14123a', plate: 'rgba(12, 10, 40, 0.78)' },
  seventies: { image: 'groovy-70s', color: '#f4a259', plate: '#fef3dd', text: { color: '#bc4b51' } },
  'gingham-merah': { image: 'picnic-daisy', color: '#ffffff', plate: '#ffffff' },
  marmer: { image: 'marble-gold', color: '#f4f1ee', plate: 'rgba(255, 255, 255, 0.85)', slot: { style: 'plain', radius: 2, border: 6, borderColor: '#c8b38a', shadow: true } },
  lebaran: { image: 'lebaran', color: '#0b5d3b', plate: 'rgba(8, 64, 40, 0.88)' },
  merdeka: { image: 'merdeka', color: '#fff5f5', plate: '#ffffff', slot: { style: 'plain', radius: 8, border: 10, borderColor: '#ffffff', shadow: true } },
  natal: { image: 'christmas', color: '#1e5631', plate: 'rgba(20, 60, 34, 0.88)' },
  imlek: { image: 'imlek', color: '#b5121b', plate: 'rgba(140, 10, 20, 0.9)' },
  valentine: { image: 'valentine', color: '#ffccd5', plate: '#ffffff' },
  halloween: { image: 'halloween-cute', color: '#3c2a4d', plate: 'rgba(30, 18, 40, 0.88)' },
  ultah: { image: 'birthday', color: '#fff4e6', plate: '#ffffff' },
  scrapbook: { image: 'scrapbook', color: '#f5ebe0', plate: '#fffdf5', slot: { style: 'tape', radius: 0, border: 10, borderColor: '#ffffff', shadow: true } },
}

const upgraded: Template[] = BASE.map((t) => {
  const u = UPGRADES[t.id]
  if (!u) return t
  return {
    ...t,
    bg: { color: u.color, image: u.image },
    spacing: SP_ART,
    slot: u.slot ?? ART_SLOT,
    text: { ...t.text, ...u.text, plate: u.plate },
    header: undefined,
    decor: undefined,
  }
})

const art = (id: string, name: string, category: Category, image: string, color: string, text: Template['text'], slot: Template['slot'] = ART_SLOT): Template => ({
  id,
  name,
  category,
  bg: { color, image },
  spacing: SP_ART,
  slot,
  text,
})

const ART: Template[] = [
  art('mawar', 'Mawar', 'Pastel', 'watercolor-roses', '#f6efe3', text('Dancing Script', '#b5536b', 62, 'sweet memories', { plate: '#fffaf2' }), { style: 'polaroid', radius: 2, border: 14, borderColor: '#ffffff', shadow: true }),
  art('herbarium', 'Herbarium', 'Elegan', 'dried-flowers', '#f3eee4', text('DM Serif Display', '#5e503f', 48, 'pressed memories', { plate: '#fbf6ec' })),
  art('y2k', 'Y2K Chrome', 'Lucu', 'y2k-chrome', '#e6dcff', text('Bebas Neue', '#6741d9', 76, 'Y2K BESTIES', { tracking: 5, plate: '#ffffff' }), { style: 'plain', radius: 24, border: 10, borderColor: '#ffffff', shadow: true }),
  art('pantai', 'Pantai', 'Lucu', 'beach', '#bfeff0', text('Fredoka', '#0b7285', 58, 'beach day', { weight: '700', plate: '#ffffff' })),
  art('tropis', 'Tropis', 'Lucu', 'tropical', '#dfe9d8', text('Fredoka', '#2d6a4f', 58, 'tropical vibes', { weight: '700', plate: '#ffffff' })),
  art('synthwave', 'Synthwave', 'Gelap', 'synthwave', '#1a1033', text('Bebas Neue', '#ff2a6d', 80, 'NIGHT DRIVE', { tracking: 6, plate: 'rgba(13, 2, 33, 0.85)' }), { style: 'plain', radius: 4, border: 6, borderColor: '#00f5d4', shadow: true }),
  art('galaksi', 'Galaksi', 'Gelap', 'galaxy', '#14123a', text('Space Mono', '#f1e9ff', 32, 'LOST IN SPACE', { tracking: 6, weight: '700', plate: 'rgba(12, 10, 40, 0.78)' }), { style: 'plain', radius: 100, border: 6, borderColor: '#ffffff', shadow: true }),
  art('awan-pink', 'Awan Pink', 'Pastel', 'cloud-sky', '#e8ddff', text('Pacifico', '#c2255c', 52, 'head in the clouds', { plate: '#ffffff' }), { style: 'arch', radius: 0, border: 0, borderColor: '#fff' }),
]

export const TEMPLATES: Template[] = [...upgraded, ...ART]

/** Kategori virtual "Ilustrasi": semua template dengan latar bergambar. */
export const isIllustrated = (t: Template) => Boolean(t.bg.image)

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]

/** Semua font yang dipakai template & pilihan teks (harus sudah dimuat sebelum menggambar ke kanvas). */
export const FONTS = [
  'Plus Jakarta Sans',
  'Fredoka',
  'Baloo 2',
  'Pacifico',
  'Caveat',
  'Dancing Script',
  'DM Serif Display',
  'Bebas Neue',
  'Space Mono',
  'Permanent Marker',
  'Press Start 2P',
]
