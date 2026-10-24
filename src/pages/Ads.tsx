import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CircleAlert,
  Eye,
  FileWarning,
  Info,
  Megaphone,
  ShieldCheck,
  ShieldX,
  Timer,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { formatDateTime, formatNumber, hostnameOf } from "../lib/format";
import { Badge, EmptyState, PageHeader, Panel, SearchInput, SectionHeader, StatCard, cn } from "../components/ui";

export function Ads() {
  const { ads, sessions, links, analytics, navigate } = useApp();
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("all");
  const [network, setNetwork] = useState("all");

  const sessionLabels = useMemo(() => new Map(sessions.map((session) => [session.id, session.label])), [sessions]);
  const linkDomains = useMemo(() => new Map(links.map((link) => [link.id, link.inspection?.finalDomain ?? hostnameOf(link.originalUrl)])), [links]);
  const formats = useMemo(() => Array.from(new Set(ads.map((ad) => ad.format))).sort(), [ads]);
  const networks = useMemo(() => Array.from(new Set(ads.map((ad) => ad.network).filter(Boolean) as string[])).sort(), [ads]);
  const averageVisibility = ads.length ? Math.round(ads.reduce((sum, ad) => sum + ad.visibleMs, 0) / ads.length) : 0;
  const verifiedImpressions = analytics?.verifiedTotals.impressions ?? 0;

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return ads.filter((ad) => {
      if (format !== "all" && ad.format !== format) return false;
      if (network !== "all" && ad.network !== network) return false;
      if (!query) return true;
      return (
        (ad.network ?? "").toLowerCase().includes(query) ||
        ad.format.toLowerCase().includes(query) ||
        ad.selector.toLowerCase().includes(query) ||
        (ad.pageUrl ?? "").toLowerCase().includes(query) ||
        (sessionLabels.get(ad.sessionId) ?? "").toLowerCase().includes(query)
      );
    });
  }, [ads, format, network, search, sessionLabels]);

  const networkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ad of ads) {
      const key = ad.network ?? "Unattributed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ads]);

  return (
    <div>
      <PageHeader
        eyebrow="Advertising intelligence"
        title="Placements detected, never clicked"
        description="Measure ad formats, visibility duration, and network signatures during authorized redirect QA. Detection is explicitly separated from a verified ad impression."
        actions={<Badge tone="amber" dot>{ads.length} observations</Badge>}
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3">
        <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <p className="text-[11px] font-semibold text-amber-100">Detected ads are not verified impressions.</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-100/60">
            LinkPilot records that a placement existed and how long it was visible. It never clicks, hovers to trigger, or interacts with advertisements. Verified impressions and earnings appear only when imported from an authorized platform API.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Placements detected" value={formatNumber(ads.length)} detail="Across completed and active sessions" icon={<Megaphone size={14} />} tone="amber" />
        <StatCard label="Unique networks" value={formatNumber(networks.length)} detail="Only reliably detectable signatures" icon={<BadgeCheck size={14} />} tone="sky" delay={40} />
        <StatCard label="Avg visibility" value={averageVisibility ? `${(averageVisibility / 1000).toFixed(1)}s` : "—"} detail="Cumulative visible time per placement" icon={<Timer size={14} />} tone="violet" delay={80} />
        <StatCard label="Verified impressions" value={formatNumber(verifiedImpressions)} detail="Authorized platform import only" icon={<Eye size={14} />} tone="emerald" delay={120} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_0.75fr]">
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <SectionHeader title="Ad observation log" description="Format, network signature, measured visibility, and detection method." />
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search network, selector, page, session" className="w-full sm:w-64" />
              <select value={format} onChange={(event) => setFormat(event.target.value)} className="input w-auto py-1.5 text-[10px]">
                <option value="all">All formats</option>
                {formats.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={network} onChange={(event) => setNetwork(event.target.value)} className="input w-auto py-1.5 text-[10px]">
                <option value="all">All networks</option>
                {networks.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <span className="ml-auto text-[9px] text-mist-600">{filtered.length} shown</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Megaphone size={18} />}
                title={ads.length === 0 ? "No placements detected yet" : "No placements match this filter"}
                description={ads.length === 0 ? "Run a browser session against an authorized test page. The agent will inspect the DOM for advertising containers without clicking them." : "Try a different format, network, or search term."}
                action={ads.length === 0 ? <button type="button" className="btn-secondary btn-xs" onClick={() => navigate("sessions")}>Open sessions</button> : null}
              />
            </div>
          ) : (
            <div className="divide-y divide-white/[0.045]">
              {filtered.map((ad) => (
                <div key={ad.id} className="px-4 py-3 hover:bg-white/[0.012] sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="amber">{ad.format}</Badge>
                        {ad.network ? <Badge tone="neutral">{ad.network}</Badge> : <Badge tone="neutral">Unattributed</Badge>}
                        <Badge tone="neutral">{ad.method}</Badge>
                        <span className="mono text-[9px] text-mist-500">{ad.size ?? "size n/a"}</span>
                      </div>
                      <div className="mt-1.5 break-all font-mono text-[9px] text-mist-500">{ad.selector}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-mist-600">
                        <span>{sessionLabels.get(ad.sessionId) ?? ad.sessionId.slice(-8)}</span>
                        <span>{linkDomains.get(ad.linkId) ?? hostnameOf(ad.pageUrl)}</span>
                        <span>{formatDateTime(ad.detectedAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                      <div className="text-right">
                        <div className="mono text-[11px] text-mist-200">{ad.visibleMs >= 1000 ? `${(ad.visibleMs / 1000).toFixed(1)}s` : `${ad.visibleMs}ms`}</div>
                        <div className="text-[8px] uppercase tracking-wider text-mist-600">visible</div>
                      </div>
                      <span className="rounded-full border border-rose-400/15 bg-rose-400/[0.07] px-2 py-0.5 text-[8px] text-rose-300">not verified</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Network signatures" description="Detected from page markup and script URLs." />
            <div className="mt-4 space-y-3">
              {networkCounts.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-mist-600">No networks detected.</p>
              ) : (
                networkCounts.map(([name, count]) => {
                  const max = networkCounts[0][1];
                  return (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-[10px]">
                        <span className="text-mist-300">{name}</span>
                        <span className="mono text-mist-500">{count}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-orange-400/80" style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Payout rules, plainly" description="Typical requirements for shortener and rewarded-link programs." />
            <ul className="mt-3 space-y-2.5 text-[10px] leading-relaxed text-mist-400">
              {[
                ["Genuine human visits", "Most programs require unique human visitors, valid traffic sources, and verified impressions."],
                ["Verified ad impressions", "A placement appearing in the DOM does not count. The network must confirm an impression through its own measurement."],
                ["Rewarded-link completion", "Rewarded flows require the visitor to complete the ad step themselves. Automated completion is prohibited."],
                ["Traffic quality", "Proxies, datacenter IPs, and browser windows are not separate human visitors and must not be reported as such."],
                ["Authorized testing", "Use publisher-approved QA accounts or staging placements when validating redirect flows."],
              ].map(([title, description]) => (
                <li key={title} className="flex gap-2">
                  <ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-400/80" />
                  <span><span className="font-medium text-mist-200">{title}.</span> {description}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-rose-400/15 bg-rose-400/[0.045] p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-rose-300"><ShieldX size={10} /> Hard limits</div>
              <p className="text-[9px] leading-relaxed text-rose-200/70">No ad clicks, no sponsored-link clicks, no rewarded-step bypass, no CAPTCHA solving, no artificial traffic, and no fabricated earnings.</p>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300"><Info size={14} /></span>
              <div>
                <h3 className="text-[11px] font-semibold text-mist-100">Authorized testing checklist</h3>
                <ul className="mt-1.5 space-y-1 text-[9px] leading-relaxed text-mist-500">
                  <li>· Use placements you own or are contracted to audit.</li>
                  <li>· Keep automated sessions separate from production traffic.</li>
                  <li>· Never import inferred values as verified metrics.</li>
                  <li>· Retain activity logs for the audit period.</li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
