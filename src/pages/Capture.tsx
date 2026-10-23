import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraGate } from '../components/CameraGate'
import { MiniStrip } from '../components/MiniStrip'
import { useStepNav } from '../components/Curtain'
import { PhotoThumb } from '../components/PhotoThumb'
import { ASPECTS, LAYOUTS, layoutById, photoCount } from '../lib/layouts'
import { beep, burst, fileToPhoto, openCamera, shutter, snap, stopStream, unlockAudio } from '../lib/media'
import { RoomCard } from '../components/Room'
import { claimSlots, displayName, memberColor, useRoom } from '../lib/room'
import { newId, renderInput, useBooth } from '../store'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function CapturePage() {
  const stepTo = useStepNav()
  const { design, settings, photos, setPhoto, setSettings, patunganFrom } = useBooth()
  const room = useRoom()
  const live = room.code !== null
  const layout = layoutById(design.layoutId)
  const ratio = ASPECTS[design.aspect].ratio

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [camError, setCamError] = useState<string | null>(null)
  const [camReady, setCamReady] = useState(false)
  const [camTry, setCamTry] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  const [flashKey, setFlashKey] = useState(0)
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const filled = photos.filter(Boolean).length
  // Di ruang foto bareng: frame yang dipesan/diisi orang lain bukan bagianmu.
  const ownerOf = (i: number) => (live ? (room.owners[i] ?? null) : null)
  const memberOf = (id: string | null) => room.members.find((m) => m.id === id)
  const takenByOther = (i: number) => {
    const o = ownerOf(i)
    return o !== null && o !== room.selfId
  }
  const empties = photos.map((p, i) => (p || takenByOther(i) ? -1 : i)).filter((i) => i >= 0)
  const mineEmpty = empties.filter((i) => ownerOf(i) === room.selfId)
  const mineFilled = photos.map((p, i) => (p && ownerOf(i) === room.selfId ? i : -1)).filter((i) => i >= 0)
  // Bagian wajar per orang (minimal anggap berdua), supaya satu orang tidak menghabiskan semua frame.
  const share = Math.ceil(photos.length / Math.max(2, room.members.filter((m) => m.online).length))
  const liveTargets = mineEmpty.length ? mineEmpty : empties.slice(0, Math.max(1, share - mineFilled.length))

  // Kamera
  useEffect(() => {
    let alive = true
    setCamReady(false)
    setCamError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Browser ini tidak bisa membuka kamera. Kamu tetap bisa upload foto.')
      return
    }
    openCamera(settings.facing)
      .then(async (stream) => {
        if (!alive) return stopStream(stream)
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => null)
          setCamReady(true)
        }
      })
      .catch((e: DOMException) => {
        if (!alive) return
        setCamError(
          e.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Izinkan kamera di pengaturan browser, atau upload foto saja.'
            : e.name === 'NotFoundError'
              ? 'Kamera tidak ditemukan. Kamu tetap bisa upload foto.'
              : 'Kamera tidak bisa dibuka (mungkin sedang dipakai aplikasi lain). Kamu tetap bisa upload foto.',
        )
      })
    return () => {
      alive = false
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [settings.facing, camTry])

  useEffect(() => () => void (cancelRef.current = true), [])
  // Layout diganti (di sini atau oleh pembuat ruang): pilihan frame lama mungkin sudah tidak ada.
  useEffect(() => setSelected(null), [photos.length])

  const shoot = useCallback(
    async (targets: number[]) => {
      const v = videoRef.current
      if (!v || !camReady || !targets.length) return
      unlockAudio()
      cancelRef.current = false
      setNote(null)
      const granted = await claimSlots(targets)
      if (!granted.length) return setNote('Frame itu sudah diambil teman. Pilih frame kosong yang lain.')
      if (granted.length < targets.length) setNote(`${targets.length - granted.length} frame sudah diambil teman, jadi dilewati.`)
      targets = granted
      setRunning(true)
      try {
        for (let n = 0; n < targets.length; n++) {
          for (let c = settings.countdown; c > 0; c--) {
            if (cancelRef.current) return
            setCount(c)
            if (settings.sound) beep(c === 1 ? 1320 : 880)
            await wait(1000)
          }
          if (cancelRef.current) return
          setCount(null)
          if (settings.sound) shutter()
          setFlashKey((k) => k + 1)
          const img = snap(v, settings.mirror)
          const clip = settings.live ? await burst(v, settings.mirror) : undefined
          setPhoto(targets[n], { id: newId(), img, burst: clip, source: 'camera' })
          setSelected(null)
          if (n < targets.length - 1) await wait(settings.interval * 1000)
        }
      } finally {
        setCount(null)
        setRunning(false)
      }
    },
    [camReady, settings, setPhoto],
  )

  async function onFiles(files: FileList) {
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    const wanted = selected !== null ? [selected] : empties
    if (!wanted.length) {
      setNote('Semua frame sudah terisi. Ketuk satu frame dulu untuk menggantinya.')
      return
    }
    const targets = await claimSlots(wanted.slice(0, list.length))
    if (!targets.length) return setNote('Frame itu sudah diambil teman. Pilih frame kosong yang lain.')
    for (let i = 0; i < Math.min(list.length, targets.length); i++) {
      try {
        setPhoto(targets[i], await fileToPhoto(list[i]))
      } catch {
        setNote(`Gagal membaca ${list[i].name}.`)
      }
    }
    if (list.length > targets.length) setNote(`${list.length - targets.length} foto tidak dipakai karena frame-nya sudah penuh.`)
    setSelected(null)
  }

  const primaryTargets =
    selected !== null ? [selected] : live ? (liveTargets.length ? liveTargets : mineFilled) : empties.length ? empties : photos.map((_, i) => i)
  const primaryLabel =
    selected !== null
      ? `${photos[selected] ? 'Foto ulang' : 'Foto'} frame ${selected + 1}`
      : live
        ? liveTargets.length
          ? liveTargets.length === 1
            ? `Foto frame ${liveTargets[0] + 1}`
            : `Foto ${liveTargets.length} frame-mu`
          : mineFilled.length
            ? 'Ulangi fotoku'
            : 'Frame sudah penuh'
        : empties.length === photos.length
          ? 'Mulai foto'
          : empties.length
            ? `Foto ${empties.length} frame sisa`
            : 'Ulangi semua'

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:items-start lg:p-6">
      {/* Kamera */}
      <div className="flex flex-col items-center gap-3 lg:flex-1">
        <div
          className="relative overflow-hidden rounded-3xl bg-inverse shadow-lg"
          style={{ aspectRatio: ratio, width: `min(100%, calc(min(58dvh, 640px) * ${ratio}))` }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="size-full object-cover"
            style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
          />
          <CameraGate
            state={camError ? 'error' : camReady ? 'ready' : 'opening'}
            message={camError}
            onUpload={() => fileRef.current?.click()}
            onRetry={() => setCamTry((n) => n + 1)}
          />
          {count !== null && (
            <div key={`c${count}`} className="anim-pop absolute inset-0 grid place-items-center font-heading text-[min(30vw,180px)] font-bold text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
              {count}
            </div>
          )}
          {flashKey > 0 && <div key={`f${flashKey}`} className="anim-flash pointer-events-none absolute inset-0 bg-white opacity-0" />}
          {running && (
            <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-danger px-3 py-1 text-xs font-bold text-white">
              ● {filled}/{photos.length}
            </span>
          )}
        </div>

        <div className="flex w-full max-w-xl items-center justify-center gap-3">
          <button className="btn px-3" onClick={() => fileRef.current?.click()} disabled={running} aria-label="Upload foto">
            <UploadIcon /> <span className="max-sm:hidden">Upload</span>
          </button>
          {running ? (
            <button className="btn min-w-44" onClick={() => (cancelRef.current = true)}>
              Berhenti
            </button>
          ) : (
            <button className="btn btn-primary min-w-44 text-lg" onClick={() => shoot(primaryTargets)} disabled={!camReady || !primaryTargets.length}>
              {primaryLabel}
            </button>
          )}
          <button
            className="btn px-3"
            onClick={() => setSettings({ facing: settings.facing === 'user' ? 'environment' : 'user', mirror: settings.facing !== 'user' })}
            disabled={running}
            aria-label="Ganti kamera depan/belakang"
          >
            <FlipIcon />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {note && <p className="text-center text-sm font-semibold text-danger">{note}</p>}
      </div>

      {/* Panel samping */}
      <aside className="flex flex-col gap-4 lg:w-80">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">
              Frame {filled}/{photos.length}
            </h2>
            {live ? (
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-bold text-accent-hover">bareng</span>
            ) : (
              patunganFrom !== null && <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-bold text-accent-hover">patungan</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {live
              ? 'Ketuk frame kosong untuk memilih bagianmu. Warna di frame menunjukkan punya siapa.'
              : 'Ketuk satu frame untuk memotret atau upload frame itu saja (mis. bagianmu saat patungan).'}
          </p>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3">
            {photos.map((p, i) => {
              const owner = live ? memberOf(ownerOf(i)) : undefined
              const color = owner ? memberColor(owner) : undefined
              const progress = room.transfer[i]
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (takenByOther(i)) return setNote(`Frame ${i + 1} punya ${displayName(owner)}.`)
                    setNote(null)
                    setSelected(selected === i ? null : i)
                  }}
                  disabled={running}
                  aria-pressed={selected === i}
                  aria-label={`Frame ${i + 1}${p ? '' : ' (kosong)'}${owner ? `, punya ${displayName(owner, room.selfId)}` : ''}`}
                  className={`relative w-20 shrink-0 overflow-hidden rounded-xl border-2 lg:w-auto ${selected === i ? 'border-accent ring-2 ring-accent' : owner ? '' : 'border-border'}`}
                  style={{ aspectRatio: ratio, borderColor: selected === i ? undefined : color }}
                >
                  {p ? (
                    <PhotoThumb photo={p} aspect={ratio} className="size-full" />
                  ) : (
                    <span className="grid size-full place-items-center bg-bg-subtle font-heading text-xl font-bold text-muted">{i + 1}</span>
                  )}
                  {owner ? (
                    <span className="absolute bottom-1 left-1 max-w-[85%] truncate rounded px-1 text-[10px] font-bold text-white" style={{ background: color }}>
                      {displayName(owner, room.selfId)}
                    </span>
                  ) : (
                    p?.source === 'friend' && <span className="absolute right-1 bottom-1 rounded bg-accent-subtle px-1 text-[10px] font-bold text-accent-hover">teman</span>
                  )}
                  {p?.burst && <span className="absolute top-1 right-1 rounded bg-inverse/70 px-1 text-[10px] font-bold text-white">live</span>}
                  {progress !== undefined && (
                    <span className="absolute inset-0 grid place-items-center bg-inverse/50 text-xs font-bold text-white">{Math.round(progress * 100)}%</span>
                  )}
                </button>
              )
            })}
          </div>
          {selected !== null && photos[selected] && (!takenByOther(selected) || room.role === 'host') && (
            <button className="mt-2 text-sm font-semibold text-danger underline" onClick={() => (setPhoto(selected, null), setSelected(null))}>
              Kosongkan frame {selected + 1}
            </button>
          )}
          <LayoutSwitch disabled={running} />
        </div>

        <div className="card p-4">
          <button className="flex w-full items-center justify-between font-heading text-lg font-bold" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            Pengaturan <span className="text-sm text-muted">{showSettings ? 'tutup' : `timer ${settings.countdown}d · jeda ${settings.interval}d`}</span>
          </button>
          {showSettings && (
            <div className="mt-3 space-y-3 text-sm">
              <Segment label="Hitung mundur" value={settings.countdown} options={[3, 5, 10]} suffix="d" onChange={(v) => setSettings({ countdown: v })} />
              <Segment label="Jeda antar foto" value={settings.interval} options={[1, 2, 3, 5]} suffix="d" onChange={(v) => setSettings({ interval: v })} />
              <Toggle label="Cermin (seperti kaca)" checked={settings.mirror} onChange={(v) => setSettings({ mirror: v })} />
              <Toggle label="Suara hitung mundur" checked={settings.sound} onChange={(v) => setSettings({ sound: v })} />
              <Toggle label="Rekam live (untuk GIF)" checked={settings.live} onChange={(v) => setSettings({ live: v })} />
            </div>
          )}
        </div>

        <RoomCard empty={photos.length - filled} />

        <button className="btn btn-primary" disabled={!filled || running} onClick={(e) => stepTo('/app/hias', e)}>
          Lanjut hias →{empties.length > 0 && filled > 0 && <span className="text-xs font-normal opacity-70">({empties.length} kosong)</span>}
        </button>
        <p className="text-center text-xs text-muted">
          {layout.name} · foto tidak pernah diunggah ke server
        </p>
      </aside>
    </div>
  )
}

function Segment({ label, value, options, suffix, onChange }: { label: string; value: number; options: number[]; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="flex rounded-full border border-border bg-surface p-0.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} aria-pressed={value === o} className={`rounded-full px-2.5 py-1 font-bold ${value === o ? 'bg-accent text-white' : ''}`}>
            {o}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-border-strong transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </svg>
)
const FlipIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h12l-3-3M20 16H8l3 3" />
  </svg>
)

/**
 * Ganti layout langsung dari langkah Foto. Di ruang foto bareng hanya pembuat ruang yang bisa, dan layout barunya
 * ikut berubah di HP semua orang: orangnya nambah, tinggal pilih layout yang framenya lebih banyak.
 */
function LayoutSwitch({ disabled }: { disabled: boolean }) {
  const { design, photos, setLayout } = useBooth()
  const { code, role, members, hostId, selfId, owners } = useRoom()
  const live = code !== null
  const guest = role === 'guest'
  const online = members.filter((m) => m.online).length
  const host = members.find((m) => m.id === hostId)
  const free = owners.filter((o) => o === null).length
  const noFrame = guest && !owners.includes(selfId) && free === 0
  const short = live && !guest && online > photos.length
  const [open, setOpen] = useState(short)
  // Orang yang masuk melebihi jumlah frame: pilihan layout langsung dibuka.
  useEffect(() => {
    if (short) setOpen(true)
  }, [short])

  const thumbs = useMemo(
    () =>
      LAYOUTS.map((l) => ({
        layout: l,
        count: photoCount(l, design.photoMode),
        input: renderInput({
          design: { ...design, layoutId: l.id, aspect: l.id === design.layoutId ? design.aspect : l.defaultAspect, overlays: [] },
          photos: [],
        }),
      })),
    // Thumbnail cukup mengikuti template & bentuk foto yang sedang dipilih.
    [design.templateId, design.templateRightId, design.layoutId, design.aspect, design.format, design.photoMode],
  )

  if (guest)
    return (
      <p className={`mt-3 rounded-xl p-3 text-xs ${noFrame ? 'bg-warning-subtle text-warning' : 'bg-bg-subtle text-muted'}`}>
        {noFrame
          ? `Semua frame sudah ada yang punya. Minta ${displayName(host)} ganti layout yang framenya lebih banyak, nanti frame barunya muncul di sini.`
          : `Layout diatur ${displayName(host)}. Frame kurang? Minta dia ganti layout.`}
      </p>
    )

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button className="flex w-full items-center justify-between text-sm font-bold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Ganti layout <span className="text-xs font-normal text-muted">{open ? 'tutup' : `${layoutById(design.layoutId).name} · ${photos.length} frame`}</span>
      </button>
      {short && (
        <p className="mt-2 rounded-xl bg-warning-subtle p-2.5 text-xs text-warning">
          Ada {online} orang di ruang, frame-nya cuma {photos.length}. Pilih layout yang framenya lebih banyak biar semua kebagian.
        </p>
      )}
      {open && (
        <>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {thumbs.map(({ layout: l, count, input }) => {
              const active = l.id === design.layoutId
              return (
                <button
                  key={l.id}
                  onClick={() => setLayout(l.id)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-center ${
                    active ? 'border-accent bg-accent-subtle' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span className="flex h-16 w-full items-center justify-center">
                    <MiniStrip input={input} fit={64} className="max-h-full max-w-full rounded-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.2)]" />
                  </span>
                  <span className="text-[11px] leading-tight font-bold">{l.name}</span>
                  <span className={`text-[10px] leading-tight ${live && count < online ? 'text-warning' : 'text-muted'}`}>{count} frame</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-muted">
            {live
              ? 'Langsung berubah di HP semua orang. Foto yang sudah masuk tetap aman; kalau framenya berkurang, foto sisanya kembali saat frame ditambah.'
              : 'Foto yang sudah diambil tetap aman; kalau framenya berkurang, foto sisanya kembali saat frame ditambah.'}
          </p>
        </>
      )}
    </div>
  )
}
