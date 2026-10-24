import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config.js";
import type { LinkInspection, RedirectHop, RiskLevel } from "../../shared/types.js";
import { HttpError } from "../lib/util.js";

export const AD_NETWORK_SIGNATURES: Array<{ name: string; needles: string[] }> = [
  { name: "Google AdSense", needles: ["adsbygoogle", "pagead2.googlesyndication.com"] },
  { name: "Google Ad Manager", needles: ["securepubads.g.doubleclick.net", "googletag.cmd", "googletagservices"] },
  { name: "Taboola", needles: ["cdn.taboola.com", "taboola.com"] },
  { name: "Outbrain", needles: ["outbrain.com", "outbrainwidget"] },
  { name: "PropellerAds", needles: ["propellerads", "propeller-ads"] },
  { name: "Adsterra", needles: ["adsterra"] },
  { name: "PopAds", needles: ["popads.net", "popads"] },
  { name: "Monetag", needles: ["monetag.com", "monetag"] },
  { name: "MGID", needles: ["mgid.com", "mgid"] },
  { name: "RevContent", needles: ["revcontent.com", "revcontent"] },
  { name: "Ezoic", needles: ["ezoic.net", "ezoic"] },
  { name: "Media.net", needles: ["media.net"] },
  { name: "Amazon Ads", needles: ["amazon-adsystem.com"] },
  { name: "ExoClick", needles: ["exoclick.com", "exoclick"] },
  { name: "JuicyAds", needles: ["juicyads.com", "juicyads"] },
  { name: "TrafficJunky", needles: ["trafficjunky.net", "trafficjunky"] },
  { name: "AdCash", needles: ["adcash.com", "adcash"] },
  { name: "HilltopAds", needles: ["hilltopads.net", "hilltopads"] },
  { name: "Clickadu", needles: ["clickadu.com", "clickadu"] },
];

const SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "shorte.st",
  "adf.ly",
  "shorturl.at",
  "rebrand.ly",
  "tiny.cc",
  "rb.gy",
  "lnkd.in",
  "s.id",
  "v.gd",
  "clck.ru",
];

const SUSPICIOUS_TLDS = new Set(["zip", "mov", "tk", "ml", "ga", "cf", "gq", "work", "kim", "country"]);
const CAPTCHA_MARKERS = [
  "cf-challenge",
  "challenge-platform",
  "captcha",
  "recaptcha",
  "hcaptcha",
  "turnstile",
  "please verify you are a human",
  "verify you are human",
  "checking your browser",
];
const UNAVAILABLE_MARKERS = [
  "link not found",
  "page not found",
  "this link has expired",
  "link expired",
  "file not found",
  "410 gone",
  "this domain is parked",
];
const BLOCKED_STATUS = new Set([401, 403, 407, 429, 451]);

export interface InspectorDeps {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  blockPrivateTargets?: boolean;
  allowLocalTargets?: boolean;
  userAgent?: string;
  now?: () => number;
}

export interface PreparedUrl {
  href: string;
  hostname: string;
}

export function normalizeUrl(input: string): PreparedUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new HttpError(400, "URL is empty", "empty_url");
  if (trimmed.length > 4096) throw new HttpError(400, "URL is too long", "url_too_long");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new HttpError(400, `Invalid URL: ${input.slice(0, 120)}`, "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only HTTP and HTTPS URLs are supported", "unsupported_protocol");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "URLs containing embedded credentials are not accepted", "credentials_in_url");
  }
  if (url.hash === "#") url.hash = "";
  return { href: url.href, hostname: url.hostname.toLowerCase() };
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
    if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7));
    if (normalized.startsWith("64:ff9b::")) return isPrivateIp(normalized.slice(9));
    return false;
  }
  return true;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
]);

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".svc")) return true;
  if (isIP(host) && isPrivateIp(host)) return true;
  return false;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

async function assertSafeTarget(url: URL, deps: InspectorDeps): Promise<void> {
  const blockPrivate = deps.blockPrivateTargets ?? config.blockPrivateTargets;
  const allowLocal = deps.allowLocalTargets ?? config.allowLocalTargets;
  if (!blockPrivate || allowLocal) return;
  if (isBlockedHostname(url.hostname)) {
    throw new HttpError(400, "Destination resolves to a private, local, or metadata address and was blocked", "private_address_blocked");
  }
  let addresses: string[];
  try {
    addresses = await (deps.resolveHost ?? defaultResolveHost)(url.hostname);
  } catch (error) {
    throw new HttpError(502, `DNS lookup failed for ${url.hostname}`, "dns_failure", String(error));
  }
  if (addresses.some((address) => isPrivateIp(address))) {
    throw new HttpError(400, "Destination resolves to a private network address and was blocked", "private_address_blocked");
  }
}

function detectAdNetworks(html: string): string[] {
  const lower = html.toLowerCase();
  return AD_NETWORK_SIGNATURES.filter((signature) => signature.needles.some((needle) => lower.includes(needle))).map(
    (signature) => signature.name,
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = stripHtml(match[1]).slice(0, 300);
  return title || null;
}

function extractDescription(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  return match ? match[1].trim().slice(0, 500) || null : null;
}

function decodeBody(buffer: Uint8Array, contentType: string | null): string {
  const charsetMatch = contentType?.match(/charset=([^;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function readCappedBody(response: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: merged, truncated };
}

function buildPayoutNotes(adNetworks: string[], captcha: boolean, blocked: boolean): string[] {
  const notes = [
    "Detection only: this inspection did not click an ad, solve a CAPTCHA, or create a verified ad impression.",
    "Most shortener and rewarded-link payouts require genuine unique human visits and platform-verified ad impressions. Automated sessions are not eligible for payout.",
  ];
  if (adNetworks.length > 0) {
    notes.push(
      `Ad-related script signatures were observed (${adNetworks.join(", ")}). Confirm placement terms directly with the network or publisher before running authorized tests.`,
    );
  }
  if (captcha) notes.push("A CAPTCHA or human-verification gate was detected. LinkPilot does not attempt to solve or bypass human-verification challenges.");
  if (blocked) notes.push("The destination returned an authentication, rate-limit, or access-denied status. Automated traffic must not be used to circumvent access controls.");
  notes.push("Use this data for authorized redirect QA, placement auditing, and publisher-approved testing only.");
  return notes;
}

export function computeRisk(flags: string[], adNetworks: string[], httpStatus: number | null): RiskLevel {
  const highFlags = ["redirect_loop", "private_address_blocked", "punycode_hostname", "ip_literal_destination", "suspicious_destination"];
  if (flags.some((flag) => highFlags.includes(flag))) return "high";
  if (httpStatus !== null && (httpStatus >= 400 || BLOCKED_STATUS.has(httpStatus))) return "medium";
  if (flags.some((flag) => ["cross_domain_redirect", "captcha_detected", "too_many_redirects", "no_https"].includes(flag))) return "medium";
  if (adNetworks.length >= 2) return "medium";
  return "low";
}

function finalizeSuspicion(flags: string[], url: URL): void {
  const labels = url.hostname.split(".");
  if (url.hostname.startsWith("xn--") || labels.some((label) => label.startsWith("xn--"))) flags.push("punycode_hostname");
  if (isIP(url.hostname)) flags.push("ip_literal_destination");
  if (labels.length >= 5) flags.push("excessive_subdomains");
  const tld = labels[labels.length - 1];
  if (tld && SUSPICIOUS_TLDS.has(tld)) flags.push("suspicious_tld");
  if (SHORTENER_HOSTS.includes(url.hostname)) flags.push("url_shortener");
  if (flags.includes("punycode_hostname") || flags.includes("ip_literal_destination") || flags.includes("suspicious_tld")) {
    flags.push("suspicious_destination");
  }
}

export async function inspectDestination(input: string, overrides: InspectorDeps = {}): Promise<LinkInspection> {
  const deps: InspectorDeps = {
    fetchImpl: fetch,
    resolveHost: defaultResolveHost,
    timeoutMs: config.inspector.timeoutMs,
    maxRedirects: config.inspector.maxRedirects,
    maxBodyBytes: config.inspector.maxBodyBytes,
    userAgent: config.inspector.userAgent,
    now: Date.now,
    ...overrides,
  };
  const startedAt = (deps.now ?? Date.now)();
  const { href, hostname } = normalizeUrl(input);
  const chain: RedirectHop[] = [];
  const flags: string[] = [];
  const visited = new Set<string>();
  let current: URL;
  try {
    current = new URL(href);
  } catch {
    throw new HttpError(400, "Invalid URL", "invalid_url");
  }

  let finalUrl: string | null = null;
  let httpStatus: number | null = null;
  let title: string | null = null;
  let description: string | null = null;
  let contentType: string | null = null;
  let pageBytes = 0;
  let adNetworks: string[] = [];
  let captcha = false;
  let loop = false;
  let blocked = false;
  let errorMessage: string | undefined;
  let redirectCount = 0;

  try {
    while (true) {
      const hopStart = (deps.now ?? Date.now)();
      await assertSafeTarget(current, deps);
      const normalized = current.href;
      if (visited.has(normalized)) {
        loop = true;
        flags.push("redirect_loop");
        chain.push({ index: chain.length, url: normalized, status: 0, durationMs: 0 });
        break;
      }
      visited.add(normalized);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
      let response: Response;
      try {
        response = await (deps.fetchImpl ?? fetch)(normalized, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": deps.userAgent ?? "LinkPilotAI/1.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.8",
          },
        });
      } catch (error) {
        const reason = controller.signal.aborted ? "timeout" : "connection_error";
        flags.push(reason);
        errorMessage = controller.signal.aborted
          ? `Request timed out after ${deps.timeoutMs}ms`
          : `Network request failed: ${error instanceof Error ? error.message : String(error)}`;
        chain.push({ index: chain.length, url: normalized, status: 0, durationMs: (deps.now ?? Date.now)() - hopStart });
        break;
      } finally {
        clearTimeout(timer);
      }

      httpStatus = response.status;
      const location = response.headers.get("location");
      const hop: RedirectHop = {
        index: chain.length,
        url: normalized,
        status: response.status,
        location: location ? new URL(location, current).href : undefined,
        durationMs: (deps.now ?? Date.now)() - hopStart,
      };
      chain.push(hop);

      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        redirectCount += 1;
        if (redirectCount > (deps.maxRedirects ?? 10)) {
          flags.push("too_many_redirects");
          errorMessage = `Exceeded ${deps.maxRedirects} redirects`;
          finalUrl = current.href;
          break;
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          flags.push("invalid_redirect");
          errorMessage = "Redirect returned an invalid location";
          finalUrl = current.href;
          break;
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          flags.push("unsupported_redirect_protocol");
          errorMessage = `Redirected to unsupported protocol ${next.protocol}`;
          finalUrl = current.href;
          break;
        }
        current = next;
        continue;
      }

      finalUrl = current.href;
      contentType = response.headers.get("content-type");
      const isHtml = !contentType || /text\/html|application\/xhtml/i.test(contentType);
      if (BLOCKED_STATUS.has(response.status)) {
        blocked = true;
        flags.push("blocked_response");
      }
      if (response.status >= 400) flags.push(`http_${response.status}`);
      if (isHtml) {
        const { bytes, truncated } = await readCappedBody(response, deps.maxBodyBytes ?? 768 * 1024);
        pageBytes = bytes.byteLength;
        if (truncated) flags.push("body_truncated");
        const html = decodeBody(bytes, contentType);
        title = extractTitle(html);
        description = extractDescription(html);
        const lower = stripHtml(html).toLowerCase();
        const rawLower = html.toLowerCase();
        if (CAPTCHA_MARKERS.some((marker) => rawLower.includes(marker) || lower.includes(marker))) {
          captcha = true;
          flags.push("captcha_detected");
        }
        if (UNAVAILABLE_MARKERS.some((marker) => lower.includes(marker))) flags.push("unavailable_page");
        adNetworks = detectAdNetworks(html);
        if (adNetworks.length > 0) flags.push("ad_networks_detected");
      } else {
        const { bytes } = await readCappedBody(response, 64 * 1024);
        pageBytes = bytes.byteLength;
      }
      break;
    }
  } catch (error) {
    if (error instanceof HttpError) {
      flags.push(error.code || "inspection_error");
      errorMessage = error.message;
      if (error.code === "private_address_blocked") flags.push("private_address_blocked");
    } else {
      flags.push("inspection_error");
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    finalUrl = chain.length > 0 ? chain[chain.length - 1].url : null;
  }

  if (!finalUrl) finalUrl = chain.length > 0 ? chain[chain.length - 1].url : null;
  let finalDomain: string | null = null;
  if (finalUrl) {
    try {
      const final = new URL(finalUrl);
      finalDomain = final.hostname.toLowerCase();
      finalizeSuspicion(flags, final);
      if (final.hostname !== hostname) flags.push("cross_domain_redirect");
      if (final.protocol === "http:") flags.push("no_https");
    } catch {
      /* noop */
    }
  }
  if (chain.length > 1) flags.push("redirect_chain");
  flags.splice(0, flags.length, ...Array.from(new Set(flags)));

  const risk = computeRisk(flags, adNetworks, httpStatus);
  if (captcha) flags.push("human_verification_required");
  if (blocked) flags.push("access_denied");

  return {
    finalUrl,
    finalDomain,
    httpStatus,
    title,
    description,
    contentType,
    chain,
    durationMs: (deps.now ?? Date.now)() - startedAt,
    risk,
    flags: Array.from(new Set(flags)),
    adNetworks,
    captcha: captcha || flags.includes("captcha_detected"),
    loop,
    blocked,
    suspicious: flags.includes("suspicious_destination"),
    pageBytes,
    error: errorMessage,
    payoutNotes: buildPayoutNotes(adNetworks, captcha, blocked),
  };
}

export function describeInspection(inspection: LinkInspection): string {
  if (inspection.loop) return "Redirect loop detected";
  if (inspection.captcha) return "Human verification gate detected";
  if (inspection.blocked) return `Blocked with HTTP ${inspection.httpStatus}`;
  if (inspection.error) return inspection.error;
  if (inspection.finalDomain) return `Resolved to ${inspection.finalDomain}`;
  return "Inspection incomplete";
}
