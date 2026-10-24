import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  Globe2,
  Info,
  Link2,
  LoaderCircle,
  Megaphone,
  MonitorPlay,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Waypoints,
  X,
} from "lucide-react";
import type { LinkRecord, SessionCount } from "../../shared/types";
import { SESSION_COUNTS } from "../../shared/types";
import { useApp } from "../state/AppContext";
import { formatDateTime, formatDuration, hostnameOf, riskMeta, timeAgo, truncate } from "../lib/format";
import {
  Badge,
  EmptyState,
  LinkStatusBadge,
  Modal,
  PageHeader,
  Panel,
  RiskBadge,
  SearchInput,
  Segmented,
  Spinner,
  Toggle,
  cn,
} from "../components/ui";

function BulkInspector() {
  const { submitUrls, importCsv, notify } = useApp();
  const [tab, setTab] = useState<"paste" | "csv">("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!text.trim()) {
      notify("Paste at least one URL", "warn");
      return;
    }
    setBusy(true);
    await submitUrls(text);
    setText("");
    setBusy(false);
  };

  const upload = async (selected: File | null) => {
    if (!selected) return;
    if (selected.size > 2_000_000) {
      notify("CSV must be under 2 MB", "error");
      return;
    }
    setFile(selected);
    setBusy(true);
    const content = await selected.text();
    await importCsv(content, selected.name);
    setBusy(false);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
            <Plus size={14} />
          </span>
          <div>
            <h2 className="text-xs font-semibold text-mist-100">New redirect inspection</h2>
            <p className="text-[9px] text-mist-600">Bulk paste or CSV · up to 100 URLs per request</p>
          </div>
        </div>
        <Segmented
          value={tab}
          onChange={(value) => setTab(value)}
          options={[
            { value: "paste", label: "Paste URLs" },
            { value: "csv", label: "CSV import" },
          ]}
        />
      </div>

      <div className="p-4 sm:p-5">
        {tab === "paste" ? (
          <>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"https://bit.ly/example\nhttps://example.com/track?ref=campaign\nhttps://tinyurl.com/another-link"}
              rows={4}
              className="input min-h-[112px] resize-y font-mono text-[11px] leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[9px] text-mist-600">
                <span>{text.split(/[\n,]+/).filter((line) => line.trim()).length} URL(s)</span>
                <span className="text-mist-700">·</span>
                <span>One per line or comma separated</span>
                <button type="button" onClick={() => setText("https://example.com")} className="text-violet-300/80 hover:text-violet-200">
                  Add example
                </button>
              </div>
              <button type="button" onClick={() => void submit()} disabled={busy || !text.trim()} className="btn-primary h-9 px-4 text-xs">
                {busy ? <Spinner size={13} /> : <Search size={13} />}
                {busy ? "Submitting…" : "Inspect links"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload(event.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
                dragging ? "border-violet-400/50 bg-violet-500/[0.07]" : "border-white/[0.1] bg-black/20 hover:border-violet-400/30 hover:bg-white/[0.02]",
              )}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-300">
                {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Upload size={18} />}
              </div>
              <p className="text-xs font-medium text-mist-200">{file ? file.name : "Drop a CSV here or browse"}</p>
              <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-mist-600">
                A column named <span className="mono text-mist-400">url</span>, <span className="mono text-mist-400">link</span>, or{" "}
                <span className="mono text-mist-400">destination</span> is detected automatically. All cells are scanned as a fallback.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(event) => void upload(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] text-mist-600">
              <span className="flex items-center gap-1"><FileSpreadsheet size={10} /> UTF-8 CSV, max 2 MB</span>
              <span>Quoted fields and headers supported</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function LaunchModal({ link, open, onClose }: { link: LinkRecord | null; open: boolean; onClose: () => void }) {
  const { launchBatch, settings } = useApp();
  const [count, setCount] = useState<SessionCount>(5);
  const [start, setStart] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxActions, setMaxActions] = useState(8);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [proxy, setProxy] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  const maxCount = settings?.safety.maxSessionsPerBatch ?? 100;
  const available = SESSION_COUNTS.filter((value) => value <= maxCount);

  const launch = async () => {
    if (!link) return;
    setBusy(true);
    await launchBatch(
      link.id,
      count,
      {
        aiEnabled,
        maxActions,
        viewport: viewport === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 },
        proxy: proxy.trim() || null,
      },
      start,
    );
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Launch browser sessions"
      description={link ? `Open ${hostnameOf(link.originalUrl)} in isolated browser contexts.` : undefined}
      width="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5 text-[9px] text-mist-600">
            <ShieldAlert size={11} className="text-emerald-400" /> Ads never clicked · CAPTCHA never bypassed
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary h-9 flex-1 text-xs sm:flex-none" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary h-9 flex-1 px-4 text-xs sm:flex-none" onClick={() => void launch()} disabled={busy || !link}>
              {busy ? <Spinner size={13} /> : <MonitorPlay size={13} />}
              {start ? `Launch ${count}` : `Create ${count}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Session count</span>
            <span className="text-[9px] text-mist-600">max {maxCount} per batch</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {available.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCount(value)}
                className={cn(
                  "rounded-lg border px-2 py-2.5 text-xs font-semibold transition-all",
                  count === value
                    ? "border-violet-400/40 bg-violet-500/15 text-violet-100 shadow-[0_0_20px_-8px_rgba(139,92,246,0.8)]"
                    : "border-white/[0.07] bg-white/[0.02] text-mist-400 hover:border-white/[0.15] hover:text-mist-200",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-mist-600">
            Each session uses a fresh browser context. Concurrency is capped at {settings?.safety.maxActiveSessions ?? 25} active sessions; the rest queue automatically.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={cn("rounded-lg border p-2.5 text-left", viewport === "desktop" ? "border-violet-400/30 bg-violet-500/[0.07]" : "border-white/[0.07] bg-white/[0.02]")}
          >
            <MonitorPlay size={14} className={viewport === "desktop" ? "text-violet-300" : "text-mist-500"} />
            <div className="mt-1.5 text-[10px] font-medium text-mist-200">Desktop</div>
            <div className="text-[8px] text-mist-600">1280 × 800</div>
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={cn("rounded-lg border p-2.5 text-left", viewport === "mobile" ? "border-violet-400/30 bg-violet-500/[0.07]" : "border-white/[0.07] bg-white/[0.02]")}
          >
            <Globe2 size={14} className={viewport === "mobile" ? "text-violet-300" : "text-mist-500"} />
            <div className="mt-1.5 text-[10px] font-medium text-mist-200">Mobile</div>
            <div className="text-[8px] text-mist-600">390 × 844</div>
          </button>
        </div>

        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <Toggle checked={start} onChange={setStart} label="Start immediately" description="Queue all sessions and begin as worker slots become available." />
          <div className="divider" />
          <Toggle checked={aiEnabled} onChange={setAiEnabled} label="AI page agent" description="Use the configured language model; falls back to deterministic heuristics." />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-mist-200">Max permitted actions</div>
              <div className="mt-0.5 text-[10px] text-mist-600">Scrolling, waits, and safe interface controls</div>
            </div>
            <select value={maxActions} onChange={(event) => setMaxActions(Number(event.target.value))} className="input w-20 py-1.5 text-[11px]">
              {[4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setAdvanced((value) => !value)} className="flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] text-mist-400 hover:text-mist-200">
            <span className="flex items-center gap-1.5"><Globe2 size={11} /> Network & region options</span>
            <ChevronDown size={12} className={cn("transition-transform", advanced && "rotate-180")} />
          </button>
          {advanced ? (
            <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <label className="block">
                <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Proxy URL (optional)</span>
                <input value={proxy} onChange={(event) => setProxy(event.target.value)} placeholder="http://user:pass@proxy-region.example:8080" className="input py-2 font-mono text-[10px]" />
              </label>
              <p className="text-[9px] leading-relaxed text-mist-600">
                Use only for legitimate regional compatibility testing. A proxy does not make sessions human visitors and must comply with the target platform's terms.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function RedirectChain({ link }: { link: LinkRecord }) {
  const inspection = link.inspection;
  if (!inspection || inspection.chain.length === 0) {
    return <p className="text-[10px] text-mist-600">No redirect chain recorded.</p>;
  }
  return (
    <div className="space-y-0">
      {inspection.chain.map((hop, index) => (
        <div key={`${hop.url}-${index}`} className="relative flex gap-3 pb-3">
          <div className="flex flex-col items-center">
            <span className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-semibold", hop.status >= 400 || hop.status === 0 ? "border-rose-400/25 bg-rose-400/10 text-rose-300" : index === inspection.chain.length - 1 ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-mist-400")}>
              {index + 1}
            </span>
            {index < inspection.chain.length - 1 ? <span className="mt-1 w-px flex-1 bg-white/[0.08]" /> : null}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("mono rounded px-1.5 py-0.5 text-[9px]", hop.status >= 400 || hop.status === 0 ? "bg-rose-500/10 text-rose-300" : "bg-white/[0.04] text-mist-300")}>
                {hop.status || "ERR"}
              </span>
              <span className="text-[9px] text-mist-600">{formatDuration(hop.durationMs)}</span>
              {index === inspection.chain.length - 1 ? <Badge tone="emerald">Final</Badge> : null}
            </div>
            <p className="mt-1 break-all text-[10px] leading-relaxed text-mist-400">{hop.url}</p>
            {hop.location ? <p className="mt-0.5 break-all text-[9px] text-mist-600">→ {hop.location}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkRow({ link, onLaunch, onDelete }: { link: LinkRecord; onLaunch: (link: LinkRecord) => void; onDelete: (link: LinkRecord) => void }) {
  const { inspectLink } = useApp();
  const [expanded, setExpanded] = useState(false);
  const inspection = link.inspection;
  const ready = link.status === "ready";
  const risk = inspection?.risk ?? "low";

  return (
    <Panel className={cn("overflow-hidden transition-colors", expanded && "border-violet-400/20")}>
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", link.status === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : ready ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-violet-400/20 bg-violet-400/10 text-violet-300")}>
            {link.status === "inspecting" || link.status === "pending" ? <Spinner size={14} /> : link.status === "error" ? <AlertTriangle size={14} /> : <Waypoints size={14} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="mono text-[11px] font-medium text-mist-100">{hostnameOf(link.originalUrl)}</span>
              <LinkStatusBadge status={link.status} />
              {ready ? <RiskBadge risk={risk} /> : null}
              {inspection?.captcha ? <Badge tone="amber">CAPTCHA</Badge> : null}
              {inspection?.loop ? <Badge tone="rose">Loop</Badge> : null}
              {inspection?.blocked ? <Badge tone="rose">Blocked</Badge> : null}
            </span>
            <span className="mt-1 block truncate text-[10px] text-mist-500">{truncate(link.originalUrl, 110)}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-mist-600">
              {inspection?.finalDomain ? (
                <span className="flex items-center gap-1"><ArrowRight size={9} /> {inspection.finalDomain}</span>
              ) : null}
              {inspection ? <span className="flex items-center gap-1"><Clock3 size={9} /> {formatDuration(inspection.durationMs)}</span> : null}
              {inspection ? <span className="flex items-center gap-1"><Waypoints size={9} /> {inspection.chain.length} hop(s)</span> : null}
              {inspection?.adNetworks.length ? <span className="flex items-center gap-1 text-amber-300/70"><Megaphone size={9} /> {inspection.adNetworks.length} network(s)</span> : null}
              <span>{timeAgo(link.createdAt)}</span>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 self-end lg:self-auto">
          <button type="button" onClick={() => onLaunch(link)} disabled={!ready} className="btn-primary btn-xs text-[10px]">
            <MonitorPlay size={11} /> Launch
          </button>
          <button type="button" onClick={() => void inspectLink(link.id)} disabled={link.status === "inspecting"} className="btn-secondary btn-xs text-[10px]">
            <RefreshCw size={10} className={cn(link.status === "inspecting" && "animate-spin")} /> Re-inspect
          </button>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="btn-ghost btn-xs text-[10px]">
            <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
          </button>
          <button type="button" onClick={() => onDelete(link)} className="btn-ghost btn-xs text-[10px] text-rose-300/70 hover:text-rose-200" aria-label="Delete link">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {expanded && inspection ? (
        <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4 sm:px-5">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Waypoints size={12} className="text-violet-300" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">Redirect chain</span>
              </div>
              <RedirectChain link={link} />
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-mist-300">
                  <CheckCircle2 size={11} className="text-emerald-300" /> Destination summary
                </div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between gap-3"><span className="text-mist-600">Final URL</span><span className="min-w-0 truncate text-right text-mist-300">{inspection.finalUrl ?? "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-mist-600">HTTP status</span><span className="mono text-mist-300">{inspection.httpStatus ?? "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-mist-600">Content type</span><span className="truncate text-right text-mist-300">{inspection.contentType ?? "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-mist-600">Page size</span><span className="mono text-mist-300">{inspection.pageBytes ? `${Math.round(inspection.pageBytes / 1024)} KB` : "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-mist-600">Inspected</span><span className="text-mist-300">{formatDateTime(link.updatedAt)}</span></div>
                </div>
                {inspection.title ? <p className="mt-2 border-t border-white/[0.05] pt-2 text-[10px] italic text-mist-400">“{inspection.title}”</p> : null}
              </div>

              {inspection.flags.length ? (
                <div>
                  <div className="mb-1.5 text-[9px] uppercase tracking-wider text-mist-600">Signals</div>
                  <div className="flex flex-wrap gap-1">
                    {inspection.flags.map((flag) => (
                      <span key={flag} className={cn("rounded-md border px-1.5 py-0.5 text-[8px]", flag.includes("captcha") || flag.includes("blocked") || flag.includes("loop") || flag.includes("private") ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200" : "border-white/[0.07] bg-white/[0.03] text-mist-500")}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {inspection.adNetworks.length ? (
                <div>
                  <div className="mb-1.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-mist-600"><Megaphone size={9} /> Ad network signatures</div>
                  <div className="flex flex-wrap gap-1">
                    {inspection.adNetworks.map((network) => <Badge key={network} tone="amber">{network}</Badge>)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-500/[0.045] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
              <Sparkles size={10} /> Monetization & payout notes
            </div>
            <ul className="space-y-1 text-[10px] leading-relaxed text-mist-400">
              {inspection.payoutNotes.map((note) => (
                <li key={note} className="flex gap-1.5"><span className="text-violet-400/60">·</span>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function Links() {
  const { links, settings, deleteLink } = useApp();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "inspecting" | "error">("all");
  const [risk, setRisk] = useState<"all" | "low" | "medium" | "high">("all");
  const [launchLink, setLaunchLink] = useState<LinkRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkRecord | null>(null);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return links.filter((link) => {
      if (status === "ready" && link.status !== "ready") return false;
      if (status === "inspecting" && !["pending", "inspecting"].includes(link.status)) return false;
      if (status === "error" && link.status !== "error") return false;
      if (risk !== "all" && link.inspection?.risk !== risk) return false;
      if (!query) return true;
      return (
        link.originalUrl.toLowerCase().includes(query) ||
        (link.inspection?.finalUrl ?? "").toLowerCase().includes(query) ||
        (link.inspection?.title ?? "").toLowerCase().includes(query) ||
        (link.inspection?.adNetworks ?? []).some((network) => network.toLowerCase().includes(query))
      );
    });
  }, [links, risk, search, status]);

  return (
    <div>
      <PageHeader
        eyebrow="URL intelligence"
        title="Inspect any redirect path"
        description="Validate shortened, tracking, and redirect URLs. LinkPilot follows the chain, detects verification gates and ad signatures, and records the final destination without loading it into a human-visible browser."
        actions={<Badge tone="violet" dot>{links.length} tracked</Badge>}
      />

      <BulkInspector />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search URL, domain, title, or network" className="w-full sm:w-72" />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "ready", label: "Ready" },
              { value: "inspecting", label: "Inspecting" },
              { value: "error", label: "Error" },
            ]}
          />
          <select value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)} className="input w-auto py-1.5 text-[11px]">
            <option value="all">All risk</option>
            <option value="low">Low risk</option>
            <option value="medium">Medium risk</option>
            <option value="high">High risk</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-mist-600">
          <Info size={10} />
          Max {settings?.safety.maxSessionsPerBatch ?? 100} sessions per batch
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {filtered.length === 0 ? (
          <Panel className="p-4">
            <EmptyState
              icon={<Link2 size={18} />}
              title={links.length === 0 ? "No links inspected yet" : "No links match this filter"}
              description={
                links.length === 0
                  ? "Paste a URL above or import a CSV. LinkPilot validates the URL, follows redirects with SSRF protection, and extracts the final destination."
                  : "Adjust the search or filter to see more results."
              }
              action={
                links.length === 0 ? (
                  <button type="button" className="btn-secondary btn-xs" onClick={() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus()}>
                    <Plus size={11} /> Add your first URL
                  </button>
                ) : null
              }
            />
          </Panel>
        ) : (
          filtered.map((link) => <LinkRow key={link.id} link={link} onLaunch={setLaunchLink} onDelete={setDeleteTarget} />)
        )}
      </div>

      <LaunchModal link={launchLink} open={Boolean(launchLink)} onClose={() => setLaunchLink(null)} />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this link?"
        description="The link and its redirect inspection will be removed. Existing browser sessions and their logs are kept for audit."
        width="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary h-9 text-xs" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button
              type="button"
              className="btn-danger h-9 text-xs"
              onClick={async () => {
                if (deleteTarget) await deleteLink(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 size={12} /> Delete link
            </button>
          </div>
        }
      >
        <div className="rounded-lg border border-white/[0.06] bg-black/25 p-3">
          <p className="break-all font-mono text-[10px] text-mist-400">{deleteTarget?.originalUrl}</p>
        </div>
      </Modal>
    </div>
  );
}
