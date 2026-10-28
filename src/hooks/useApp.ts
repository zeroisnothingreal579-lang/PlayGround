import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createProvider } from '../providers'
import { clearState, defaultState, loadState, saveState } from '../lib/storage'
import type {
  AppState,
  CountryCode,
  DurationId,
  Rental,
  Settings,
  SmsMessage,
  ViewId,
} from '../types'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

export interface ConfirmConfig {
  title: string
  body: string
  confirmLabel: string
  tone: 'danger' | 'primary'
  action: () => void | Promise<void>
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(area)
  if (!copied) throw new Error('Copy failed')
}

export function useApp() {
  const [state, setState] = useState<AppState>(loadState)
  const [view, setView] = useState<ViewId>('numbers')
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const toastId = useRef(0)

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    toastId.current += 1
    const id = toastId.current
    setToasts((previous) => [...previous.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const provider = useMemo(() => createProvider(state.settings), [state.settings])
  const providerRef = useRef(provider)
  providerRef.current = provider

  useEffect(() => {
    let cancelled = false
    let running = false

    const tick = async () => {
      if (running) return
      const active = stateRef.current.rentals.filter((rental) => rental.status === 'active')
      if (active.length === 0) {
        setNow(Date.now())
        return
      }
      running = true
      const results = await Promise.all(
        active.map((rental) =>
          providerRef.current.sync(rental, Date.now()).catch(() => rental),
        ),
      )
      running = false
      if (cancelled) return

      const before = stateRef.current
      const fresh: { rental: Rental; message: SmsMessage }[] = []
      let changed = false

      for (const next of results) {
        const previous = before.rentals.find((rental) => rental.id === next.id)
        if (!previous) continue
        if (
          previous.messages.length !== next.messages.length ||
          previous.status !== next.status ||
          previous.expiresAt !== next.expiresAt
        ) {
          changed = true
        }
        if (next.messages.length > previous.messages.length) {
          for (const message of next.messages.slice(previous.messages.length)) {
            fresh.push({ rental: next, message })
          }
        }
      }

      if (changed) {
        setState((previous) => ({
          ...previous,
          rentals: previous.rentals.map(
            (rental) => results.find((next) => next.id === rental.id) ?? rental,
          ),
        }))
      }

      for (const { message } of fresh) {
        pushToast(
          message.code
            ? `${message.from} · code ${message.code}`
            : `${message.from} · new message`,
          'success',
        )
        if (
          stateRef.current.settings.notifications &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(`${message.from} · Hush`, {
            body: message.body,
            tag: message.id,
          })
        }
      }
      setNow(Date.now())
    }

    void tick()
    const timer = window.setInterval(
      () => void tick(),
      state.settings.provider === 'demo' ? 1000 : 6000,
    )
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [provider, state.settings.provider, pushToast])

  const selectCountry = useCallback((country: CountryCode) => {
    setState((previous) => ({ ...previous, selectedCountry: country }))
  }, [])

  const selectService = useCallback((serviceId: string) => {
    setState((previous) => ({ ...previous, selectedService: serviceId }))
  }, [])

  const selectDuration = useCallback((duration: DurationId) => {
    setState((previous) => ({ ...previous, selectedDuration: duration }))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((previous) => ({
      ...previous,
      settings: { ...previous.settings, ...patch },
    }))
  }, [])

  const setNotifications = useCallback(
    async (enabled: boolean) => {
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setState((previous) => ({
            ...previous,
            settings: { ...previous.settings, notifications: false },
          }))
          pushToast('Browser notifications were blocked. In-app alerts stay on.', 'info')
          return
        }
      }
      setState((previous) => ({
        ...previous,
        settings: { ...previous.settings, notifications: enabled },
      }))
      pushToast(enabled ? 'Browser notifications on.' : 'Browser notifications off.', 'info')
    },
    [pushToast],
  )

  const acquire = useCallback(async () => {
    const current = stateRef.current
    if (current.rentals.some((rental) => rental.status === 'active')) {
      setView('inbox')
      pushToast('You already have an active number.', 'info')
      return
    }
    setBusy(true)
    try {
      const rental = await providerRef.current.acquire({
        country: current.selectedCountry,
        serviceId: current.selectedService,
        duration: current.selectedDuration,
      })
      setState((previous) => ({
        ...previous,
        rentals: [rental, ...previous.rentals].slice(0, 100),
      }))
      setNow(Date.now())
      setView('inbox')
      pushToast('Number ready. Listening for messages.', 'success')
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : 'Could not get a number. Try again.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }, [pushToast])

  const requestRelease = useCallback(
    (id: string) => {
      const rental = stateRef.current.rentals.find((item) => item.id === id)
      if (!rental) return
      setConfirm({
        title: 'Release this number?',
        body: `You will stop receiving messages on ${rental.phoneNumber}. This cannot be undone.`,
        confirmLabel: 'Release number',
        tone: 'danger',
        action: async () => {
          try {
            await providerRef.current.release(rental)
          } catch (error) {
            pushToast(
              error instanceof Error
                ? `${error.message} The number was released locally.`
                : 'The provider did not confirm the release.',
              'info',
            )
          }
          setState((previous) => ({
            ...previous,
            rentals: previous.rentals.map((item) =>
              item.id === rental.id ? { ...item, status: 'released' } : item,
            ),
          }))
          setView((previous) => (previous === 'inbox' ? 'history' : previous))
          pushToast('Number released.', 'success')
        },
      })
    },
    [pushToast],
  )

  const extend = useCallback(
    (id: string) => {
      setState((previous) => ({
        ...previous,
        rentals: previous.rentals.map((rental) =>
          rental.id === id
            ? {
                ...rental,
                expiresAt: Math.max(rental.expiresAt, Date.now()) + 10 * 60_000,
                status: 'active',
              }
            : rental,
        ),
      }))
      setNow(Date.now())
      pushToast('Added 10 minutes to this number.', 'success')
    },
    [pushToast],
  )

  const copy = useCallback(
    async (text: string, label = 'Copied to clipboard.') => {
      try {
        await writeClipboard(text)
        pushToast(label, 'success')
      } catch {
        pushToast('Copy failed. Select the text manually.', 'error')
      }
    },
    [pushToast],
  )

  const removeRental = useCallback(
    (id: string) => {
      setState((previous) => ({
        ...previous,
        rentals: previous.rentals.filter(
          (rental) => rental.id !== id || rental.status === 'active',
        ),
      }))
      pushToast('Entry removed.', 'info')
    },
    [pushToast],
  )

  const clearHistory = useCallback(() => {
    setConfirm({
      title: 'Clear all history?',
      body: 'Every released and expired number, including its messages, will be deleted from this browser.',
      confirmLabel: 'Clear history',
      tone: 'danger',
      action: () => {
        setState((previous) => ({
          ...previous,
          rentals: previous.rentals.filter((rental) => rental.status === 'active'),
        }))
        pushToast('History cleared.', 'success')
      },
    })
  }, [pushToast])

  const exportHistory = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Hush',
      rentals: stateRef.current.rentals,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `hush-history-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    pushToast('History exported.', 'success')
  }, [pushToast])

  const resetData = useCallback(() => {
    setConfirm({
      title: 'Reset Hush?',
      body: 'This clears numbers, messages, and connection settings stored in this browser.',
      confirmLabel: 'Reset everything',
      tone: 'danger',
      action: () => {
        clearState()
        setState(defaultState())
        setView('numbers')
        pushToast('Hush was reset.', 'success')
      },
    })
  }, [pushToast])

  const resolveConfirm = useCallback(async () => {
    const current = confirm
    if (!current) return
    setConfirm(null)
    await current.action()
  }, [confirm])

  const activeRental = state.rentals.find((rental) => rental.status === 'active') ?? null
  const historyCount = state.rentals.filter((rental) => rental.status !== 'active').length

  return {
    state,
    now,
    view,
    setView,
    busy,
    toasts,
    confirm,
    activeRental,
    historyCount,
    provider,
    pushToast,
    dismissToast,
    selectCountry,
    selectService,
    selectDuration,
    updateSettings,
    setNotifications,
    acquire,
    requestRelease,
    extend,
    copy,
    removeRental,
    clearHistory,
    exportHistory,
    resetData,
    resolveConfirm,
    cancelConfirm: () => setConfirm(null),
  }
}

export type AppController = ReturnType<typeof useApp>
