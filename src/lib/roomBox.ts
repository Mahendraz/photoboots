/**
 * Titipan ruang foto bareng di server, supaya teman tetap bisa masuk saat pembuat ruang keluar sebentar
 * (mis. lagi kirim link di WhatsApp; browser HP menghentikan sambungan halaman yang ditinggal).
 *
 * Yang dititipkan hanya layout, nama, dan pemilik frame; fotonya tidak. Isinya dienkripsi di browser (AES-GCM)
 * dengan kunci turunan kode ruang, dan kode itu hanya ada di link setelah `#` yang tidak pernah dikirim browser
 * ke server. Server menyimpan ID hash + data acak, jadi tidak bisa membaca isinya. Titipan hanya bisa dibuka sampai
 * 5 menit setelah pembuat ruang terakhir aktif (lihat ROOM_GRACE_MS di worker).
 */

import { decryptJson, encryptJson, hashHex, linkKey } from './linkCrypto'

const boxId = (code: string) => hashHex(`inwebbooth-room:${code}`)
const boxKey = (code: string) => linkKey(code, 'room')
const seal = async (code: string, value: unknown) => encryptJson(await boxKey(code), value)
const unseal = async <T>(code: string, sealed: string) => decryptJson<T>(await boxKey(code), sealed)

/** Titipkan keadaan ruang. `keepalive` untuk detik-detik halaman ditinggal. Gagal = diam (ruang live tetap jalan). */
export async function putBox(code: string, writeKey: string, value: unknown, keepalive = false) {
  try {
    const res = await fetch(`/api/rooms/${await boxId(code)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: writeKey, data: await seal(code, value) }),
      keepalive,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Ambil titipan ruang; null kalau tidak ada / pembuat ruang sudah lebih dari 5 menit tidak aktif. */
export async function getBox<T>(code: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/rooms/${await boxId(code)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: string }
    return await unseal<T>(code, data)
  } catch {
    return null
  }
}

export async function dropBox(code: string, writeKey: string) {
  try {
    await fetch(`/api/rooms/${await boxId(code)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: writeKey }),
      keepalive: true,
    })
  } catch {
    /* titipan habis sendiri setelah 5 menit */
  }
}
