import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="card w-full max-w-lg space-y-4 p-6 text-center" aria-labelledby="not-found-title">
        <p className="font-bold text-accent-hover">404</p>
        <h1 id="not-found-title" className="font-heading text-2xl font-bold">
          Halaman ini tidak ditemukan
        </h1>
        <p className="text-sm text-muted">Alamatnya mungkin berubah. Foto yang tersimpan di perangkat tetap aman.</p>
        <Link to="/app" className="btn btn-primary inline-flex min-h-11 items-center justify-center px-5">
          Kembali ke awal
        </Link>
      </section>
    </div>
  )
}
