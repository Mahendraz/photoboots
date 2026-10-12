import type { Photo } from './render'
import { newId } from '../store'

const MAX_SIDE = 1600
const BURST_SIDE = 360

function frameToCanvas(src: CanvasImageSource, sw: number, sh: number, maxSide: number, mirror: boolean) {
  const k = Math.min(1, maxSide / Math.max(sw, sh))
  const c = document.createElement('canvas')
  c.width = Math.round(sw * k)
  c.height = Math.round(sh * k)
  const ctx = c.getContext('2d')!
  if (mirror) {
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

export async function openCamera(facing: 'user' | 'environment') {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
  })
}

export const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop())

export function snap(video: HTMLVideoElement, mirror: boolean) {
  return frameToCanvas(video, video.videoWidth, video.videoHeight, MAX_SIDE, mirror)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Ambil beberapa frame kecil berurutan (±1 detik) untuk GIF live. */
export async function burst(video: HTMLVideoElement, mirror: boolean, frames = 8, gapMs = 110) {
  const out: HTMLCanvasElement[] = []
  for (let i = 0; i < frames; i++) {
    out.push(frameToCanvas(video, video.videoWidth, video.videoHeight, BURST_SIDE, mirror))
    if (i < frames - 1) await wait(gapMs)
  }
  return out
}

export async function fileToPhoto(file: File): Promise<Photo> {
  const bmp = await createImageBitmap(file)
  const img = frameToCanvas(bmp, bmp.width, bmp.height, MAX_SIDE, false)
  bmp.close()
  return { id: newId(), img, source: 'upload' }
}

export async function dataUrlToCanvas(url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  return frameToCanvas(img, img.naturalWidth, img.naturalHeight, MAX_SIDE, false)
}

// ------------------------------------------------------------------ suara (WebAudio, tanpa berkas)

let audio: AudioContext | null = null
const ac = () => (audio ??= new AudioContext())

export function beep(freq = 880, ms = 90) {
  try {
    const ctx = ac()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + ms / 1000)
  } catch {
    /* audio tidak tersedia */
  }
}

export function shutter() {
  try {
    const ctx = ac()
    const len = ctx.sampleRate * 0.12
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    const src = ctx.createBufferSource()
    const g = ctx.createGain()
    g.gain.value = 0.35
    src.buffer = buf
    src.connect(g).connect(ctx.destination)
    src.start()
  } catch {
    /* audio tidak tersedia */
  }
}

/** Panggil dari gestur pengguna supaya iOS mengizinkan audio. */
export const unlockAudio = () => {
  try {
    void ac().resume()
  } catch {
    /* abaikan */
  }
}
