import { useEffect, useMemo } from "react";
import {
  BadgeCheck,
  BarChart3,
  CircleAlert,
  Download,
  Eye,
  Link2,
  Megaphone,
  MonitorPlay,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { formatDateTime, formatNumber } from "../lib/format";
import { AdsBarChart, DestinationBars, SessionsChart } from "../components/Charts";
import { Badge, EmptyState, PageHeader, Panel, SectionHeader, Segmented, StatCard, cn } from "../components/ui";

const importSnippet = `curl -X POST https://your-linkpilot-host/api/analytics/verified \\
  -H "Authorization: Bearer $ANALYTICS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "publisher-platform",
    "metric": "impressions",
    "value": 0,
    "periodStart": "2026-10-01T00:00:00Z",
    "periodEnd": "2026-10-01T23:59:59Z",
    "note": "Imported from an authorized platform report"
  }'`;

export function Analytics() {
  const { analytics, analyticsDays, setAnalyticsDays, refreshAnalytics, exportCsv, settings, sessions } = useApp();

  useEffect(() => {
    void refreshAnalytics(analyticsDays);
  }, [analyticsDays, refreshAnalytics]);

  const verified = analytics?.verified ?? [];
  const verifiedEarnings = analytics?.verifiedTotals.earnings;
  const verifiedVisits = analytics?.verifiedTotals.visits;
  const verifiedClicks = analytics?.verifiedTotals.clicks;

  const destinationData = useMemo(() => analytics?.destinations ?? [], [analytics]);

  return (
    <div>
      <PageHeader
        eyebrow="Measurement"
        title="Automation analytics"
        description="Internal measurements from real inspection and browser activity, clearly separated from platform-verified visits, clicks, impressions, and earnings."
        actions={
          <>
            <Segmented
              value={analyticsDays}
              onChange={setAnalyticsDays}
              options={[
                { value: 7, label: "7d" },
                { value: 14, label: "14d" },
                { value: 30, label: "30d" },
                { value: 90, label: "90d" },
              ]}
            />
            <button type="button" onClick={() => void exportCsv("sessions")} className="btn-secondary h-9 px-3 text-xs">
              <Download size={12} /> Sessions CSV
            </button>
            <button type="button" onClick={() => void exportCsv("links")} className="btn-secondary h-9 px-3 text-xs">
              <Download size={12} /> Links CSV
            </button>
          </>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-sky-400/15 bg-sky-400/[0.045] px-4 py-3 text-[10px] leading-relaxed text-sky-100/70">
        <CircleAlert size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p>
          <span className="font-semibold text-sky-100">Measured activity is not verified traffic.</span> Session counts, destinations, and ad detections come from LinkPilot's own logs. Verified metrics are shown only when supplied by an authorized analytics API and are never inferred, estimated, or fabricated.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Automation sessions" value={formatNumber(analytics?.sessionCount ?? 0)} detail={`Last ${analyticsDays} days`} icon={<MonitorPlay size={14} />} />
        <StatCard label="Completion rate" value={`${formatNumber(analytics?.successRate ?? 0)}%`} detail={`${analytics?.completed ?? 0} completed · ${analytics?.failed ?? 0} failed`} icon={<TrendingUp size={14} />} tone="emerald" delay={40} />
        <StatCard label="Ads detected" value={formatNumber(analytics?.adsDetected ?? 0)} detail="Observations, not impressions" icon={<Megaphone size={14} />} tone="amber" delay={80} />
        <StatCard label="Verified visits" value={verifiedVisits !== undefined ? formatNumber(verifiedVisits) : "—"} detail={verifiedVisits !== undefined ? "Authorized import" : "No authorized source supplied"} icon={<BadgeCheck size={14} />} tone="sky" delay={120} />
        <StatCard label="Verified earnings" value={verifiedEarnings !== undefined ? `$${formatNumber(verifiedEarnings, { minimumFractionDigits: 2 })}` : "—"} detail={verifiedEarnings !== undefined ? "Authorized platform total" : "Not supplied"} icon={<Eye size={14} />} tone="violet" delay={160} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
        <Panel className="p-4 sm:p-5">
          <SectionHeader
            title="Session activity"
            description="Created, completed, and failed automation sessions per day."
            action={<Badge tone="violet">{analytics?.sessionCount ?? 0} in range</Badge>}
          />
          <div className="mt-4">
            {analytics ? <SessionsChart series={analytics.series} /> : <div className="skeleton h-56 w-full" />}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Ad detections per day" description="Placement observations, never counted as impressions." />
            <div className="mt-4">
              {analytics ? <AdsBarChart series={analytics.series} /> : <div className="skeleton h-28 w-full" />}
            </div>
            <div className="mt-2 flex justify-between text-[8px] text-mist-600">
              <span>{analytics?.series[0]?.date.slice(5)}</span>
              <span>{analytics?.series.at(-1)?.date.slice(5)}</span>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Final destinations" description="Resolved domains across measured sessions." />
            <div className="mt-4">
              <DestinationBars destinations={destinationData} emptyLabel="No destination data in this range." />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <SectionHeader title="Verified platform metrics" description="Only values imported through the authorized API." />
            <div className="flex items-center gap-2">
              <Badge tone={settings?.integrations.verifiedImportEnabled ? "emerald" : "neutral"} dot>
                {settings?.integrations.verifiedImportEnabled ? "Import enabled" : "Not configured"}
              </Badge>
              <button type="button" onClick={() => void exportCsv("verified")} className="btn-secondary btn-xs text-[10px]">
                <Download size={10} /> Export
              </button>
            </div>
          </div>

          {verified.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ShieldCheck size={18} />}
                title="No verified metrics imported"
                description={
                  settings?.integrations.verifiedImportEnabled
                    ? "The authorized import endpoint is enabled, but no platform report has been supplied yet. LinkPilot will not estimate these values."
                    : "Set ANALYTICS_API_KEY on the server to enable the authorized import endpoint. LinkPilot never infers visits, clicks, impressions, or earnings."
                }
                compact
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.055] text-[8px] uppercase tracking-wider text-mist-600">
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Imported</th>
                  </tr>
                </thead>
                <tbody>
                  {verified.map((metric) => (
                    <tr key={metric.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 text-[10px] text-mist-300">{metric.source}</td>
                      <td className="px-3 py-2.5"><Badge tone="violet">{metric.metric}</Badge></td>
                      <td className="mono px-3 py-2.5 text-right text-[10px] text-mist-200">{formatNumber(metric.value)}</td>
                      <td className="px-3 py-2.5 text-[9px] text-mist-500">{metric.periodStart.slice(0, 10)} → {metric.periodEnd.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 text-[9px] text-mist-600">{formatDateTime(metric.importedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeader title="Authorized import" description="Connect a publisher or analytics platform report." />
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/25 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] text-mist-500">
              <Link2 size={10} /> POST /api/analytics/verified
            </div>
            <pre className="max-h-52 overflow-auto text-[8px] leading-relaxed text-mist-500">{importSnippet}</pre>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-mist-500">Import endpoint</span>
              <Badge tone={settings?.integrations.verifiedImportEnabled ? "emerald" : "neutral"}>{settings?.integrations.verifiedImportEnabled ? "ready" : "disabled"}</Badge>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-mist-500">Measured sessions in range</span>
              <span className="mono text-mist-300">{analytics?.sessionCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-mist-500">Total sessions stored</span>
              <span className="mono text-mist-300">{sessions.length}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-mist-500">Verified clicks</span>
              <span className="mono text-mist-300">{verifiedClicks !== undefined ? formatNumber(verifiedClicks) : "—"}</span>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[9px] leading-relaxed text-mist-600">
            Exports include measured activity only. The verified export contains only imported platform rows.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void exportCsv("ads")} className="btn-secondary btn-xs text-[10px]"><Megaphone size={10} /> Ads CSV</button>
            <button type="button" onClick={() => void exportCsv("verified")} className="btn-secondary btn-xs text-[10px]"><BarChart3 size={10} /> Verified CSV</button>
          </div>
        </Panel>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[10px] leading-relaxed text-mist-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-300" />
        <p className={cn("leading-relaxed")}>
          Historical charts are computed from stored LinkPilot sessions and ad observations. There are no synthetic visitors, clicks, impressions, or revenue in this dashboard.
        </p>
      </div>
    </div>
  );
}
