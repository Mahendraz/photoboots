import { shareOrDownload } from './export'
import { buildPatungan } from './patungan'
import type { Photo } from './render'
import type { Design } from '../store'

/** Kirim berkas patungan lewat menu bagikan HP (WhatsApp, dsb) atau unduh di laptop. */
export async function sendPatungan(design: Design, photos: (Photo | null)[], from: string | null) {
  const blob = buildPatungan(design, photos, from)
  const d = new Date()
  const name = `patungan-photobooth-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.txt`
  return shareOrDownload(blob, name)
}
