import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight, Check, CreditCard, Download, HardDrive, Info, Receipt, Sparkles,
  Timer, TriangleAlert, Users, Zap,
} from 'lucide-react'
import type { Plan, UsageSummary } from '@shared/contracts'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Badge, Button, Card, PageHeader, Progress, Skeleton } from '../components/ui'
import { cn, formatDate, formatGbFromMb, money, relativeTime } from '../lib/utils'

interface BillingResponse {
  plan: Plan
  usage: UsageSummary
  billingMode: string
  notice: string
  invoices: { id: string; number: string; amountCents: number; status: string; periodStart: string; periodEnd: string; createdAt: string; demo: boolean }[]
}

export default function BillingPage() {
  const { setPlan } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const billingQuery = useQuery<BillingResponse>({
    queryKey: ['billing'],
    queryFn: () => get('/billing'),
  })
  const plansQuery = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => get('/plans'),
    staleTime: 60_000,
  })

  const billing = billingQuery.data
  const plan = billing?.plan
  const usage = billing?.usage
  const plans = plansQuery.data?.plans || []

  const storagePct = usage?.limits.storageMb ? (usage.storageMb / usage.limits.storageMb) * 100 : 0
  const hoursPct = usage?.limits.monthlyHours ? ((usage.minutes / 60) / usage.limits.monthlyHours) * 100 : 0
  const devicePct = usage?.limits.maxDevices ? (usage.deviceCount / usage.limits.maxDevices) * 100 : 0
  const concurrencyPct = usage?.limits.maxConcurrent ? (usage.runningCount / usage.limits.maxConcurrent) * 100 : 0

  async function changePlan(planId: string) {
    try {
      await post('/billing/change-plan', { planId })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['usage'] }),
      ])
      const next = plans.find((item) => item.id === planId)
      if (next) setPlan(next)
      toast(`Switched to ${next?.name || planId}`, { kind: 'success', description: 'Preview billing — no card was charged.' })
    } catch (error: any) {
      toast('Could not change plan', { kind: 'error', description: error?.message })
    }
  }

  if (billingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 shimmer rounded-lg" />
        <div className="grid gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-48" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing & usage"
        title="Plan and resource usage"
        description="Quotas mirror the resources this deployment can actually provision. Failed launches are never billed."
        actions={<Badge tone="amber">Preview billing</Badge>}
      />

      <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-[11px] leading-relaxed text-amber-200/80">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {billing?.notice || 'Billing is in preview mode. No payment method is charged in this environment.'}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr,1fr,1fr]">
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-iris-500/20 blur-3xl" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Current plan</p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-white">{plan?.name}</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">{plan?.tagline}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-iris-400/25 bg-iris-500/10 text-iris-300"><Sparkles className="h-4 w-4" /></div>
          </div>
          <div className="mt-4 flex items-end gap-1.5">
            <span className="font-display text-3xl font-semibold text-white">{plan?.priceCents === 0 ? '$0' : money(plan?.priceCents || 0)}</span>
            <span className="pb-1 text-[11px] text-zinc-500">/ month</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"><p className="text-zinc-600">Phones</p><p className="mt-0.5 text-zinc-300">{plan?.maxDevices}</p></div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"><p className="text-zinc-600">Concurrent</p><p className="mt-0.5 text-zinc-300">{plan?.maxConcurrent}</p></div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"><p className="text-zinc-600">RAM cap</p><p className="mt-0.5 text-zinc-300">{formatGbFromMb(plan?.ramMb || 0)}</p></div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"><p className="text-zinc-600">vCPU cap</p><p className="mt-0.5 text-zinc-300">{plan?.vcpu}</p></div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">This period</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{Math.round(((usage?.minutes || 0) / 60) * 10) / 10}<span className="text-sm font-normal text-zinc-500"> h</span></p>
          <p className="text-[11px] text-zinc-500">of {usage?.limits.monthlyHours} runtime hours</p>
          <Progress className="mt-3" value={hoursPct} tone={hoursPct > 85 ? 'rose' : 'green'} />
          <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[10px]">
            <div className="flex justify-between"><span className="text-zinc-500">Sessions</span><span className="text-zinc-300">{usage?.runningCount} running</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Devices</span><span className="text-zinc-300">{usage?.deviceCount} / {usage?.limits.maxDevices}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Storage</span><span className="text-zinc-300">{formatGbFromMb(Math.round(usage?.storageMb || 0))}</span></div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Next invoice estimate</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{plan?.priceCents === 0 ? '$0.00' : money(plan?.priceCents || 0)}</p>
          <p className="text-[11px] text-zinc-500">No overage billing in preview</p>
          <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[10px]">
            <div className="flex justify-between"><span className="text-zinc-500">Billing mode</span><span className="text-amber-300">Preview</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Payment method</span><span className="text-zinc-400">Not required</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Failed boots</span><span className="text-emerald-300">Not billed</span></div>
          </div>
          <Button variant="secondary" size="sm" className="mt-4 w-full" disabled><CreditCard className="h-3.5 w-3.5" /> Add payment method</Button>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-sm font-semibold text-white">Resource quotas</h3>
          <div className="mt-4 space-y-4">
            {[
              { icon: Users, label: 'Phones', value: `${usage?.deviceCount || 0} / ${usage?.limits.maxDevices}`, pct: devicePct, tone: 'violet' as const },
              { icon: Zap, label: 'Concurrent sessions', value: `${usage?.runningCount || 0} / ${usage?.limits.maxConcurrent}`, pct: concurrencyPct, tone: 'cyan' as const },
              { icon: HardDrive, label: 'Storage', value: `${formatGbFromMb(Math.round(usage?.storageMb || 0))} / ${formatGbFromMb(usage?.limits.storageMb || 0)}`, pct: storagePct, tone: storagePct > 85 ? 'rose' as const : 'violet' as const },
              { icon: Timer, label: 'Runtime hours', value: `${Math.round(((usage?.minutes || 0) / 60) * 10) / 10} / ${usage?.limits.monthlyHours}`, pct: hoursPct, tone: hoursPct > 85 ? 'rose' as const : 'green' as const },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-2 text-zinc-400"><row.icon className="h-3.5 w-3.5 text-zinc-500" /> {row.label}</span>
                  <span className="font-mono text-zinc-300">{row.value}</span>
                </div>
                <Progress className="mt-1.5" value={row.pct} tone={row.tone} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-white">Invoices</h3>
            <Receipt className="h-4 w-4 text-zinc-500" />
          </div>
          {billing?.invoices.length ? (
            <div className="divide-y divide-white/[0.05]">
              {billing.invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500"><Receipt className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-zinc-200">{invoice.number}</p>
                    <p className="text-[9px] text-zinc-500">{formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-300">{money(invoice.amountCents)}</p>
                    <Badge tone="amber" className="mt-0.5">{invoice.status}</Badge>
                  </div>
                  <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300" title="Preview invoice"><Download className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-[11px] text-zinc-600">No invoices yet.</div>
          )}
          <p className="border-t border-white/[0.06] px-5 py-2.5 text-[9px] text-zinc-600">Invoices in this environment are preview documents only.</p>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Change plan</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">Downgrades are rejected if you have more phones than the new plan allows.</p>
          </div>
          <Badge tone="amber"><TriangleAlert className="h-3 w-3" /> No charges</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((item) => {
            const current = item.id === plan?.id
            const featured = item.id === 'pro'
            return (
              <div key={item.id} className={cn(
                'relative flex flex-col rounded-2xl border p-5',
                current ? 'border-iris-400/40 bg-iris-500/[0.06]' : featured ? 'border-white/[0.1] bg-ink-850' : 'border-white/[0.07] bg-ink-850',
              )}>
                {current && <span className="absolute right-4 top-4 rounded-full border border-iris-400/30 bg-iris-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-iris-200">Current</span>}
                <h3 className="font-display text-sm font-semibold text-white">{item.name}</h3>
                <p className="mt-0.5 text-[10px] text-zinc-500">{item.tagline}</p>
                <p className="mt-4 font-display text-2xl font-semibold text-white">{item.priceCents === 0 ? '$0' : money(item.priceCents)}<span className="text-[10px] font-normal text-zinc-500"> /mo</span></p>
                <ul className="mt-4 flex-1 space-y-1.5 text-[10px] text-zinc-400">
                  {item.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5"><Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-400" /> {feature}</li>
                  ))}
                </ul>
                <Button
                  variant={current ? 'secondary' : 'outline'}
                  size="sm"
                  className="mt-4 w-full"
                  disabled={current}
                  onClick={() => changePlan(item.id)}
                >
                  {current ? 'Current plan' : item.priceCents > (plan?.priceCents || 0) ? <>Upgrade <ArrowUpRight className="h-3 w-3" /></> : 'Downgrade'}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-center text-[9px] text-zinc-600">
        Billing records in this deployment are marked {billing?.billingMode || 'preview'}. Connect a payment provider before production use.
        {billing && <span> · Updated {relativeTime(billing.invoices[0]?.createdAt)}</span>}
      </p>
    </div>
  )
}
