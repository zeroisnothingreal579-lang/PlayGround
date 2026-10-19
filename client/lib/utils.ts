import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DeviceStatus } from '@shared/contracts'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : decimals)} ${units[index]}`
}

export function formatGbFromMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
  return `${mb} MB`
}

export function relativeTime(value: string | number | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

export const STATUS_META: Record<DeviceStatus, { label: string; dot: string; text: string; bg: string }> = {
  running: { label: 'Running', dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  stopped: { label: 'Stopped', dot: 'bg-zinc-500', text: 'text-zinc-300', bg: 'bg-white/[0.04] border-white/10' },
  starting: { label: 'Starting', dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-400/20' },
  stopping: { label: 'Stopping', dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-400/20' },
  error: { label: 'Error', dot: 'bg-rose-400', text: 'text-rose-300', bg: 'bg-rose-400/10 border-rose-400/20' },
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
