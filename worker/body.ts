/** Baca body bertahap supaya request besar ditolak sebelum seluruh isinya masuk ke memori. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declaredLength = request.headers.get('Content-Length')
  if (declaredLength !== null) {
    const length = Number(declaredLength)
    if (Number.isFinite(length) && length > maxBytes) return null
  }
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export function parseJsonBody<T>(body: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(body)) as T
  } catch {
    return null
  }
}
