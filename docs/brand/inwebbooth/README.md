# InWebBooth brand

Simbol kamera + strip foto 2 frame, satu warna `#0B5FFF` di kedua tema; lensa, jendela bidik, lampu kilat,
dan frame strip berupa potongan transparan. Wordmark "InWebBooth" Plus Jakarta Sans 700, `#14181F` terang /
`#FFFFFF` gelap. Format mengikuti keluarga InWeb (`InWeb/docs/brand/four-batches-inkfix-2026-10-02/`):
`components/` (SVG vektor), `ready/` (PNG/WebP 512 & 384, horizontal 469×116, icon 16–512, favicon.ico), `review.png`.

Dibuat dari kode, bukan generate AI: `source/marks.mjs` (geometri simbol) + `source/build.mjs`
(wordmark dari font lewat opentype.js, ekspor lewat sharp). Butuh `opentype.js`, `@fontsource/plus-jakarta-sans`,
`png-to-ico`, dan `sharp`; jalankan `node build.mjs <folder-keluaran>` dari folder yang punya paket itu.
`source/candidates.png` = 4 kandidat simbol awal (A dipakai).
