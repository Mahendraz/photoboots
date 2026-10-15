// Kandidat simbol InWebBooth (viewBox 512). Satu warna #0B5FFF, potongan = transparan (mask), sama dengan keluarga InWeb.
export const BLUE = '#0B5FFF'

const rr = (x, y, w, h, r, fill = 'white', extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`

// A — kamera dengan strip foto keluar dari atas.
function markA() {
  const body = rr(40, 196, 432, 272, 72) + rr(92, 160, 128, 72, 26)
  const strip = `<g transform="rotate(9 350 140)">${rr(282, 22, 140, 236, 30)}</g>`
  const stripHoles = `<g transform="rotate(9 350 140)">${rr(308, 48, 88, 58, 12, 'black')}${rr(308, 128, 88, 58, 12, 'black')}</g>`
  return `<mask id="m"><rect width="512" height="512" fill="black"/>
    ${strip}${stripHoles}
    ${rr(28, 184, 456, 296, 84, 'black')}${rr(80, 148, 152, 96, 36, 'black')}
    ${body}
    <circle cx="256" cy="338" r="104" fill="black"/>
    <circle cx="256" cy="338" r="66" fill="white"/>
    <circle cx="232" cy="314" r="16" fill="black"/>
    <circle cx="402" cy="252" r="17" fill="black"/>
  </mask><rect width="512" height="512" fill="${BLUE}" mask="url(#m)"/>`
}

// Strip 3 frame; frame tengah berisi senyum (mata + mulut tetap biru di dalam potongan).
function strip(cx, cy, w, h, deg, smile) {
  const x = cx - w / 2, y = cy - h / 2
  const pad = w * 0.15, fw = w - pad * 2, gap = pad * 0.85
  const fh = (h - pad * 2 - gap * 2) / 3
  let holes = ''
  for (let i = 0; i < 3; i++) holes += rr(x + pad, y + pad + i * (fh + gap), fw, fh, fw * 0.14, 'black')
  let face = ''
  if (smile) {
    const fy = y + pad + fh + gap, mx = x + w / 2
    face = `<circle cx="${mx - fw * 0.2}" cy="${fy + fh * 0.4}" r="${fw * 0.085}" fill="white"/>
      <circle cx="${mx + fw * 0.2}" cy="${fy + fh * 0.4}" r="${fw * 0.085}" fill="white"/>
      <path d="M${mx - fw * 0.24} ${fy + fh * 0.62} Q${mx} ${fy + fh * 0.9} ${mx + fw * 0.24} ${fy + fh * 0.62}" stroke="white" stroke-width="${fw * 0.1}" stroke-linecap="round" fill="none"/>`
  }
  return `<g transform="rotate(${deg} ${cx} ${cy})">${rr(x, y, w, h, w * 0.16)}${holes}${face}</g>`
}
function stripGap(cx, cy, w, h, deg, g) {
  return `<g transform="rotate(${deg} ${cx} ${cy})">${rr(cx - w / 2 - g, cy - h / 2 - g, w + g * 2, h + g * 2, w * 0.16 + g, 'black')}</g>`
}

// B — satu strip miring.
function markB() {
  return `<mask id="m"><rect width="512" height="512" fill="black"/>${strip(256, 256, 196, 452, -10, true)}</mask>
    <rect width="512" height="512" fill="${BLUE}" mask="url(#m)"/>`
}

// C — dua strip mengipas (belakang polos, depan dengan senyum).
function markC() {
  return `<mask id="m"><rect width="512" height="512" fill="black"/>
    ${strip(318, 250, 168, 400, 14, false)}
    ${stripGap(198, 262, 168, 400, -10, 18)}
    ${strip(198, 262, 168, 400, -10, true)}
  </mask><rect width="512" height="512" fill="${BLUE}" mask="url(#m)"/>`
}

// D — kotak kamera bulat (gaya gelembung ChatBot) dengan strip 3 frame sebagai potongan.
function markD() {
  return `<mask id="m"><rect width="512" height="512" fill="black"/>
    ${rr(24, 80, 464, 392, 104)}${rr(320, 40, 120, 80, 30)}
    ${rr(192, 136, 128, 280, 24, 'black')}
    ${rr(212, 156, 88, 72, 12)}${rr(212, 240, 88, 72, 12)}${rr(212, 324, 88, 72, 12)}
    <circle cx="104" cy="160" r="22" fill="black"/>
  </mask><rect width="512" height="512" fill="${BLUE}" mask="url(#m)"/>`
}

export const marks = { A: markA, B: markB, C: markC, D: markD }
export const svg = (inner, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${color ? inner.replaceAll(BLUE, color) : inner}</svg>`
