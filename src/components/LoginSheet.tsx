import { submitLogout, useAuth } from '../lib/api'
import { stashSession } from '../lib/stash'
import { useUi } from '../ui'
import { Sheet } from './Sheet'

/** Menu akun untuk pengguna yang sudah masuk (masuknya lewat halaman /app/masuk). */
export function AccountSheet() {
  const open = useUi((s) => s.loginOpen)
  const close = useUi((s) => s.closeLogin)
  const { user, quota } = useAuth()
  if (!user) return null

  return (
    <Sheet open={open} onClose={close} title="Akun kamu">
      <div className="space-y-4">
        <p>
          Halo, <b>{user.name}</b>
          {user.email && <span className="block text-sm text-muted">{user.email}</span>}
        </p>
        <QuotaBar used={quota.used} limit={quota.limit} />
        <button
          className="btn w-full"
          onClick={async () => {
            // Keluar berpindah halaman (logout Auth0): simpan dulu foto sesi ini.
            await stashSession()
            submitLogout()
          }}
        >
          Keluar
        </button>
        <p className="text-xs text-muted">Keluar mengakhiri sesi di semua perangkat.</p>
      </div>
    </Sheet>
  )
}

export function QuotaBar({ used, limit }: { used: number; limit: number }) {
  const left = Math.max(0, limit - used)
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm font-semibold">
        <span>Strip gratis hari ini</span>
        <span className="tabular-nums">
          sisa {left} dari {limit}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={`h-2.5 flex-1 rounded-full ${i < used ? 'bg-border' : 'bg-accent'}`} />
        ))}
      </div>
    </div>
  )
}
