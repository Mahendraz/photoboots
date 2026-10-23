/**
 * Enkripsi berbasis link: kunci diturunkan dari kode di link (bagian setelah `#`, tidak pernah dikirim browser ke
 * server). Server hanya menerima ID hash dan data acak, jadi isi titipan (foto, nama, layout) tidak bisa dibacanya.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))
export const hashHex = async (s: string) => [...(await digest(s))].map((x) => x.toString(16).padStart(2, '0')).join('')

export function toBase64(b: Uint8Array) {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Kunci AES-GCM untuk satu kode link; `purpose` memisahkan kunci titipan ruang dan estafet. */
export const linkKey = async (code: string, purpose: string) =>
  crypto.subtle.importKey('raw', await digest(`inwebbooth-${purpose}-key:${code}`), 'AES-GCM', false, ['encrypt', 'decrypt'])

/** IV acak 12 byte di depan, lalu ciphertext. */
export async function encryptBytes(key: CryptoKey, plain: BufferSource) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  const out = new Uint8Array(iv.length + data.length)
  out.set(iv)
  out.set(data, iv.length)
  return out
}

export async function decryptBytes(key: CryptoKey, sealed: Uint8Array<ArrayBuffer>) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.slice(0, 12) }, key, sealed.slice(12)))
}

export const encryptJson = async (key: CryptoKey, value: unknown) => toBase64(await encryptBytes(key, enc.encode(JSON.stringify(value))))
export const decryptJson = async <T>(key: CryptoKey, sealed: string) => JSON.parse(dec.decode(await decryptBytes(key, fromBase64(sealed)))) as T
