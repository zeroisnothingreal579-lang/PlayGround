import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from './utils'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (title: string, options?: { kind?: ToastKind; description?: string }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback((title: string, options?: { kind?: ToastKind; description?: string }) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-3), { id, kind: options?.kind || 'info', title, description: options?.description }])
    window.setTimeout(() => dismiss(id), 5200)
  }, [dismiss])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
          {toasts.map((item) => {
            const Icon = icons[item.kind]
            return (
              <div
                key={item.id}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-xl border bg-ink-800/95 p-3.5 shadow-2xl backdrop-blur-xl',
                  item.kind === 'success' && 'border-emerald-400/25',
                  item.kind === 'error' && 'border-rose-400/25',
                  item.kind === 'info' && 'border-iris-400/25',
                )}
              >
                <Icon className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  item.kind === 'success' && 'text-emerald-400',
                  item.kind === 'error' && 'text-rose-400',
                  item.kind === 'info' && 'text-iris-300',
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                  {item.description && <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{item.description}</p>}
                </div>
                <button onClick={() => dismiss(item.id)} className="rounded p-0.5 text-zinc-500 transition hover:text-zinc-200">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
