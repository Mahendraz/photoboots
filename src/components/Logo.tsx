export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="18" y="4" width="28" height="56" rx="4" fill="#1f1a17" />
      <rect x="22" y="9" width="20" height="13" rx="2" fill="#ff4f6d" />
      <rect x="22" y="25" width="20" height="13" rx="2" fill="#ffd166" />
      <rect x="22" y="41" width="20" height="13" rx="2" fill="#7bdff2" />
    </svg>
  )
}
