import { useState } from 'react'

/**
 * Panduan visual "foto bareng dari jauh" (patungan): pilih contoh (LDR, geng beda kota, keluarga), lalu empat
 * langkah bergambar yang menunjukkan frame mana diisi siapa. Diagram strip digambar dengan HTML (bukan foto),
 * warnanya satu per orang dari token design system.
 */

interface Person {
  name: string
  /** Kelas warna kotak frame orang ini. */
  tone: string
}

interface Scenario {
  id: string
  label: string
  layout: string
  cols: number
  rows: number
  people: Person[]
  /** Pemilik tiap frame (indeks `people`), urut frame 1, 2, 3, … */
  owners: number[]
  where: string
  result: string
}

const KAMU: Person = { name: 'Kamu', tone: 'bg-accent text-white' }
const P2 = 'bg-accent-subtle text-accent-hover ring-1 ring-inset ring-accent/40'
const P3 = 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning/40'
const P4 = 'bg-success/10 text-success ring-1 ring-inset ring-success/40'

const SCENARIOS: Scenario[] = [
  {
    id: 'ldr',
    label: 'Pacaran LDR',
    layout: 'Strip 4',
    cols: 1,
    rows: 4,
    people: [KAMU, { name: 'Pacar', tone: P2 }],
    owners: [0, 0, 1, 1],
    where: 'Kamu di Jakarta, pacarmu di Makassar.',
    result: 'Satu strip berdua, kayak duduk sebelahan di booth. Dua-duanya bisa unduh dan cetak.',
  },
  {
    id: 'geng',
    label: 'Geng beda kota',
    layout: 'Grid 6',
    cols: 2,
    rows: 3,
    people: [KAMU, { name: 'Bestie 1', tone: P2 }, { name: 'Bestie 2', tone: P3 }],
    owners: [0, 0, 1, 1, 2, 2],
    where: 'Bertiga, kota beda-beda. Berkasnya dikirim berantai.',
    result: 'Tiap orang dua frame. Yang terakhir mengisi kirim balik ke grup supaya semua punya.',
  },
  {
    id: 'keluarga',
    label: 'Keluarga jauh',
    layout: 'Grid 4',
    cols: 2,
    rows: 2,
    people: [KAMU, { name: 'Ayah', tone: P2 }, { name: 'Ibu', tone: P3 }, { name: 'Adik', tone: P4 }],
    owners: [0, 1, 2, 3],
    where: 'Kamu merantau, Ayah-Ibu di kampung, Adik kuliah di kota lain.',
    result: 'Foto keluarga lengkap walau lebaran belum bisa pulang.',
  },
]

function Silhouette() {
  return (
    <svg viewBox="0 0 24 24" className="size-[55%] max-h-5 max-w-5 opacity-90" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4.2" />
      <path d="M3.5 21c.6-4.6 4.1-7.4 8.5-7.4s7.9 2.8 8.5 7.4z" />
    </svg>
  )
}

/** Diagram strip: `show[i]` = frame i sudah terisi pemiliknya; selain itu kotak putus-putus bernomor. */
function Strip({ s, show, highlight }: { s: Scenario; show: (i: number) => boolean; highlight?: (i: number) => boolean }) {
  return (
    <div className="w-16 shrink-0 rounded-md border border-border bg-surface p-1 shadow-sm" aria-hidden>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${s.cols}, minmax(0, 1fr))` }}>
        {s.owners.map((o, i) =>
          show(i) ? (
            <span
              key={i}
              className={`grid aspect-[4/3] place-items-center rounded-[3px] ${s.people[o].tone} ${highlight?.(i) ? 'outline-2 outline-offset-1 outline-accent' : ''}`}
            >
              <Silhouette />
            </span>
          ) : (
            <span key={i} className="grid aspect-[4/3] place-items-center rounded-[3px] border border-dashed border-border-strong text-[9px] font-semibold text-muted">
              {i + 1}
            </span>
          ),
        )}
      </div>
      <span className="mt-1 block h-1 rounded-full bg-border" />
    </div>
  )
}

function FileChip() {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1" aria-hidden>
      <span className="relative grid h-14 w-12 place-items-center rounded-md border border-border bg-surface shadow-sm">
        <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
        <span className="absolute -right-2 -bottom-2 grid size-6 place-items-center rounded-full bg-accent text-white shadow-sm">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </span>
      <span className="text-[10px] font-semibold text-muted">.txt</span>
    </div>
  )
}

/** `stepsClass` = kelas grid daftar langkah (di lembar sempit cukup satu kolom). */
export function PatunganGuide({ stepsClass = 'sm:grid-cols-2 lg:grid-cols-4' }: { stepsClass?: string }) {
  const [id, setId] = useState(SCENARIOS[0].id)
  const s = SCENARIOS.find((x) => x.id === id)!
  const others = s.people.slice(1).map((p) => p.name)
  const yours = s.owners.flatMap((o, i) => (o === 0 ? [i + 1] : []))
  const chain = s.people.length > 2

  const steps = [
    {
      visual: <Strip s={s} show={(i) => s.owners[i] === 0} highlight={(i) => s.owners[i] === 0} />,
      title: 'Kamu isi bagianmu dulu',
      body: (
        <>
          Pilih layout <b>{s.layout}</b>, lalu di langkah Foto ketuk frame {yours.join(' & ')} satu per satu dan foto. Frame lain biarkan kosong.
        </>
      ),
    },
    {
      visual: <FileChip />,
      title: 'Kirim berkas patungan',
      body: (
        <>
          Tekan <b>Kirim ke teman</b>, pilih WhatsApp, kirim ke {others[0]}. Isinya foto + desain strip, tanpa lewat server kami.
        </>
      ),
    },
    {
      visual: <Strip s={s} show={(i) => s.owners[i] <= 1} highlight={(i) => s.owners[i] === 1} />,
      title: `${others[0]} buka & isi sisanya`,
      body: chain ? (
        <>
          Di InWebBooth: <b>Buka berkas dari teman</b>, foto frame bagiannya, lalu kirim lagi ke {others.slice(1).join(', lalu ')}.
        </>
      ) : (
        <>
          Di InWebBooth: <b>Buka berkas dari teman</b> (di halaman awal), lalu foto frame yang masih kosong.
        </>
      ),
    },
    {
      visual: <Strip s={s} show={() => true} />,
      title: 'Jadi satu strip',
      body: <>{s.result}</>,
    },
  ]

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Contoh foto bareng dari jauh">
        {SCENARIOS.map((x) => (
          <button
            key={x.id}
            role="radio"
            aria-checked={x.id === id}
            onClick={() => setId(x.id)}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors ${
              x.id === id ? 'border-accent bg-accent text-white' : 'border-border bg-surface hover:border-border-strong'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        {s.where}{' '}
        <span className="inline-flex flex-wrap gap-x-2 gap-y-1 align-middle">
          {s.people.map((p) => (
            <span key={p.name} className="inline-flex items-center gap-1 text-xs font-semibold text-text">
              <span className={`inline-block size-3 rounded-[3px] ${p.tone}`} aria-hidden />
              {p.name}
            </span>
          ))}
        </span>
      </p>

      <ol className={`mt-3 grid gap-3 ${stepsClass}`}>
        {steps.map((st, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex w-16 shrink-0 items-start justify-center">{st.visual}</div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-subtle text-[11px] text-accent-hover">{i + 1}</span>
                {st.title}
              </p>
              <p className="mt-1 text-sm leading-snug text-muted">{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
