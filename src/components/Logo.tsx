import { cn } from '../lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/25 via-violet-600/10 to-fuchsia-500/10', className)}>
      <svg viewBox="0 0 32 32" className="h-[58%] w-[58%]" fill="none" aria-hidden>
        <path d="M11.4 20.6a5.7 5.7 0 0 1 0-8.1l2.2-2.2a5.7 5.7 0 0 1 8.1 0 1.5 1.5 0 0 1-2.1 2.1 2.7 2.7 0 0 0-3.9 0l-2.2 2.2a2.7 2.7 0 0 0 0 3.9 1.5 1.5 0 0 1-2.1 2.1Z" fill="url(#lp-a)" />
        <path d="M20.6 11.4a5.7 5.7 0 0 1 0 8.1l-2.2 2.2a5.7 5.7 0 0 1-8.1 0 1.5 1.5 0 0 1 2.1-2.1 2.7 2.7 0 0 0 3.9 0l2.2-2.2a2.7 2.7 0 0 0 0-3.9 1.5 1.5 0 0 1 2.1-2.1Z" fill="url(#lp-b)" />
        <defs>
          <linearGradient id="lp-a" x1="8" y1="8" x2="23" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c4b5fd" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="lp-b" x1="23" y1="24" x2="8" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f0abfc" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity=".55" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-white/[0.12]" />
    </div>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-9 w-9" />
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-bold tracking-tight text-white">
            LinkPilot <span className="text-violet-300">AI</span>
          </div>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">Automation ops</div>
        </div>
      )}
    </div>
  )
}
