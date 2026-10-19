import { cn } from '../lib/utils'

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-iris-400/30 bg-gradient-to-br from-iris-500/30 via-ink-800 to-electric-500/20 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v5a5.5 5.5 0 0 1-11 0v-5Z" fill="url(#droid-body)" stroke="rgba(255,255,255,.35)" strokeWidth=".8" />
          <circle cx="9.4" cy="11.3" r="1.05" fill="#0a0a10" />
          <circle cx="14.6" cy="11.3" r="1.05" fill="#0a0a10" />
          <path d="M9.4 14.2c.8.7 1.7 1 2.6 1s1.8-.3 2.6-1" stroke="#0a0a10" strokeWidth="1" strokeLinecap="round" />
          <path d="M8 6.7 6.6 4.9M16 6.7l1.4-1.8" stroke="rgba(196,181,253,.9)" strokeWidth="1.2" strokeLinecap="round" />
          <defs>
            <linearGradient id="droid-body" x1="6" y1="5" x2="18" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c4b5fd" />
              <stop offset=".55" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {showWordmark && (
        <span className="font-display text-[17px] font-semibold tracking-tight text-white">
          Cloud<span className="text-iris-300">Droid</span>
        </span>
      )}
    </div>
  )
}
