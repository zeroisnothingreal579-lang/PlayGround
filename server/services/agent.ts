import type { Page } from "playwright-core";
import { AD_NETWORK_SIGNATURES } from "./urlInspector.js";
import { reviewAgentAction, type AgentAction } from "./policy.js";
import type { ResolvedAiConfig } from "./settings.js";
import { extractJsonObject } from "../lib/util.js";

export interface RawAdCandidate {
  selector: string;
  width: number;
  height: number;
  visible: boolean;
  signature: string;
  format: string;
  text: string;
}

export interface RawControl {
  selector: string;
  label: string;
  kind: "skip" | "continue" | "close";
  href: string | null;
  external: boolean;
}

export interface PageAnalysis {
  url: string;
  title: string;
  description: string;
  text: string;
  pageType: "landing" | "interstitial" | "captcha" | "blocked" | "unavailable" | "unknown";
  captcha: boolean;
  blocked: boolean;
  ads: RawAdCandidate[];
  controls: RawControl[];
  countdowns: string[];
  metaRefresh: string | null;
  canonical: string | null;
}

export interface DetectedAdDraft {
  selector: string;
  format: string;
  network: string | null;
  size: string | null;
  method: "heuristic" | "ai";
}

export interface AgentAnalysis {
  pageType: PageAnalysis["pageType"];
  summary: string;
  ads: DetectedAdDraft[];
  actions: AgentAction[];
  source: "heuristic" | "llm" | "hybrid";
  model: string | null;
  warnings: string[];
}

export function detectAdNetwork(signature: string): string | null {
  const lower = signature.toLowerCase();
  const match = AD_NETWORK_SIGNATURES.find((network) => network.needles.some((needle) => lower.includes(needle)));
  return match?.name ?? null;
}

function classifyFormat(width: number, height: number, signature: string): string {
  if (/video|vpaid|vast/i.test(signature)) return "video";
  if (width >= 900 && height <= 200) return "billboard";
  if (width >= 700 && height <= 160) return "leaderboard";
  if (height >= 500 && width <= 220) return "skyscraper";
  if (width <= 420 && height <= 130) return "mobile-banner";
  if (width >= 280 && height >= 220) return "rectangle";
  if (/native|taboola|outbrain|mgid/i.test(signature)) return "native";
  return "display";
}

export async function analyzePageDom(page: Page): Promise<PageAnalysis> {
  const raw = await page.evaluate(() => {
    const removeMarkers = (attribute: string) => {
      document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
    };
    removeMarkers("data-linkpilot-ad");
    removeMarkers("data-linkpilot-control");

    const isVisible = (element: Element): boolean => {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      return inViewport && rect.width * rect.height > 400;
    };
    const attributesOf = (element: Element): string => {
      const html = element.outerHTML.slice(0, 600);
      return html.toLowerCase();
    };

    const adSelector = [
      "ins.adsbygoogle",
      "[data-ad-slot]",
      "[data-ad]",
      "[data-ad-unit]",
      "iframe[src*='doubleclick']",
      "iframe[src*='googlesyndication']",
      "iframe[src*='adserver']",
      "iframe[src*='ads']",
      "[id^='ad-']",
      "[id^='ads-']",
      "[class*='advert']",
      "[class*='sponsor']",
      "[class*='ad-slot']",
      "[class*='ad-unit']",
      "[aria-label*='advert' i]",
    ].join(",");
    const adElements = new Set<Element>();
    for (const selector of adSelector.split(",")) {
      try {
        document.querySelectorAll(selector).forEach((element) => adElements.add(element));
      } catch {
        /* skip invalid */
      }
    }
    const ads: Array<{ selector: string; width: number; height: number; visible: boolean; signature: string; text: string }> = [];
    let adIndex = 0;
    for (const element of adElements) {
      const signature = attributesOf(element);
      if (/adblock|adguard|addthis|add-to|download|gradient|shadow/i.test(signature)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) continue;
      element.setAttribute("data-linkpilot-ad", String(adIndex));
      const selector = `[data-linkpilot-ad="${adIndex}"]`;
      ads.push({
        selector,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible(element),
        signature,
        text: (element.textContent || "").trim().slice(0, 80),
      });
      adIndex += 1;
      if (ads.length >= 20) break;
    }

    const controlCandidates = new Set<Element>();
    document.querySelectorAll("button, a, [role='button'], input[type='button'], [role='link']").forEach((element) => {
      const label = ((element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim();
      if (!label || label.length > 80) return;
      if (!/skip|continue|close|dismiss|no thanks|proceed|next|watch|download app/i.test(label)) return;
      if (!isVisible(element)) return;
      const container = element.closest(
        "[data-linkpilot-ad], ins.adsbygoogle, [data-ad], [data-ad-slot], [class*='advert'], [class*='sponsor'], iframe, [aria-label*='advert' i]",
      );
      if (container) return;
      controlCandidates.add(element);
    });

    let controlIndex = 0;
    const controls: Array<{ selector: string; label: string; kind: "skip" | "continue" | "close"; href: string | null; external: boolean }> = [];
    for (const element of controlCandidates) {
      const label = ((element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim();
      if (!label) continue;
      const kind: "skip" | "continue" | "close" = /skip/i.test(label)
        ? "skip"
        : /close|dismiss|no thanks/i.test(label)
          ? "close"
          : "continue";
      const href = element instanceof HTMLAnchorElement ? element.href : null;
      let external = false;
      if (href) {
        try {
          external = new URL(href).hostname !== window.location.hostname;
        } catch {
          external = false;
        }
      }
      element.setAttribute("data-linkpilot-control", String(controlIndex));
      controls.push({
        selector: `[data-linkpilot-control="${controlIndex}"]`,
        label: label.slice(0, 80),
        kind,
        href,
        external,
      });
      controlIndex += 1;
      if (controls.length >= 12) break;
    }

    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const lowerText = bodyText.toLowerCase();
    const captcha =
      /captcha|verify you are human|checking your browser|cf-challenge|hcaptcha|recaptcha|turnstile/.test(lowerText) ||
      Array.from(document.querySelectorAll("iframe")).some((frame) => /captcha|challenge|turnstile/i.test(frame.getAttribute("src") || ""));
    const blocked = /access denied|forbidden|blocked|rate limit|too many requests|unusual traffic/.test(lowerText);
    const unavailable = /link (not found|expired)|page not found|404 not found|410 gone|domain is parked/.test(lowerText);
    const countdowns = Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const text = (element.textContent || "").trim();
        if (text.length > 30) return false;
        return /\b\d{1,2}\s*(s|sec|secs|second|seconds)\b/i.test(text) || /countdown|timer/i.test(`${element.id} ${element.className}`);
      })
      .slice(0, 8)
      .map((element) => (element.textContent || "").trim())
      .filter(Boolean);

    let pageType: "landing" | "interstitial" | "captcha" | "blocked" | "unavailable" | "unknown" = "landing";
    if (captcha) pageType = "captcha";
    else if (blocked) pageType = "blocked";
    else if (unavailable) pageType = "unavailable";
    else if (countdowns.length > 0 || controls.length > 0) pageType = "interstitial";
    else if (bodyText.length < 40) pageType = "unknown";

    const metaRefresh = document.querySelector("meta[http-equiv='refresh' i]")?.getAttribute("content") || null;
    const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href") || null;
    const description = document.querySelector("meta[name='description']")?.getAttribute("content") || "";

    return {
      url: window.location.href,
      title: document.title || "",
      description,
      text: bodyText.slice(0, 6000),
      pageType,
      captcha,
      blocked,
      ads,
      controls,
      countdowns,
      metaRefresh,
      canonical,
      adNetworkText: ads.map((ad) => ad.signature).join(" ").slice(0, 3000),
    };
  });

  return {
    url: raw.url,
    title: raw.title.slice(0, 300),
    description: raw.description.slice(0, 500),
    text: raw.text,
    pageType: raw.pageType,
    captcha: raw.captcha,
    blocked: raw.blocked,
    ads: raw.ads.map((ad) => ({
      ...ad,
      format: classifyFormat(ad.width, ad.height, ad.signature),
    })),
    controls: raw.controls,
    countdowns: raw.countdowns,
    metaRefresh: raw.metaRefresh,
    canonical: raw.canonical,
  };
}

function heuristicAds(analysis: PageAnalysis): DetectedAdDraft[] {
  return analysis.ads.map((ad) => {
    const network = detectAdNetwork(ad.signature);
    return {
      selector: ad.selector,
      format: ad.format,
      network,
      size: `${ad.width}x${ad.height}`,
      method: "heuristic" as const,
    };
  });
}

function heuristicActions(analysis: PageAnalysis, maxActions: number): AgentAction[] {
  const actions: AgentAction[] = [];
  if (analysis.pageType === "captcha") {
    return [{ type: "finish", reason: "Human verification gate detected; automatic bypass is prohibited" }];
  }
  if (analysis.controls.length > 0) {
    const control = analysis.controls.find((item) => item.kind === "skip") || analysis.controls.find((item) => item.kind === "continue");
    if (control) {
      actions.push({
        type: control.kind === "skip" ? "click_skip" : "click_continue",
        selector: control.selector,
        label: control.label,
        reason: "Permitted interface control detected outside advertising containers",
      });
    }
  }
  if (analysis.countdowns.length > 0 && actions.length < maxActions) {
    actions.push({ type: "wait", ms: 3000, reason: "Countdown detected; waiting without bypassing the gate" });
  }
  if (analysis.text.length > 1200 && actions.length < maxActions) {
    actions.push({ type: "scroll", reason: "Inspect below-the-fold content and late-loading placements" });
  }
  actions.push({ type: "finish", reason: "Automated inspection complete" });
  return actions.slice(0, maxActions);
}

function summarizeHeuristic(analysis: PageAnalysis, ads: DetectedAdDraft[]): string {
  const parts: string[] = [];
  const pageLabel: Record<PageAnalysis["pageType"], string> = {
    landing: "landing page",
    interstitial: "interstitial / gate page",
    captcha: "human-verification challenge",
    blocked: "blocked or rate-limited page",
    unavailable: "unavailable destination",
    unknown: "page with limited content",
  };
  parts.push(`Inspected a ${pageLabel[analysis.pageType]}`);
  if (analysis.title) parts.push(`titled "${analysis.title.slice(0, 100)}"`);
  if (ads.length > 0) parts.push(`detected ${ads.length} advertising placement${ads.length === 1 ? "" : "s"}`);
  if (analysis.controls.length > 0) parts.push(`${analysis.controls.length} permitted navigation control(s) found`);
  if (analysis.countdowns.length > 0) parts.push("countdown gate observed");
  if (analysis.captcha) parts.push("CAPTCHA not bypassed");
  parts.push("no advertisements were clicked");
  return `${parts.join("; ")}.`;
}

interface LlmPageResponse {
  pageType?: string;
  summary?: string;
  ads?: Array<{ selector?: string; format?: string; network?: string }>;
  actions?: Array<{ type?: string; selector?: string; label?: string; reason?: string; ms?: number }>;
}

export async function analyzeWithHeuristics(analysis: PageAnalysis, maxActions = 8): Promise<AgentAnalysis> {
  const ads = heuristicAds(analysis);
  return {
    pageType: analysis.pageType,
    summary: summarizeHeuristic(analysis, ads),
    ads,
    actions: heuristicActions(analysis, maxActions),
    source: "heuristic",
    model: null,
    warnings: analysis.captcha ? ["Human verification detected; no bypass attempted"] : [],
  };
}

const SYSTEM_PROMPT = `You are the LinkPilot AI page-inspection agent for authorized redirect and ad-placement QA.
Return ONLY JSON with this shape:
{"pageType":"landing|interstitial|captcha|blocked|unavailable|unknown","summary":"...","ads":[{"selector":"...","format":"leaderboard|rectangle|skyscraper|video|native|display","network":"name or null"}],"actions":[{"type":"scroll|wait|click_skip|click_continue|click_close|finish","selector":"(only from provided controls)","label":"...","reason":"...","ms":0}]}

Hard rules:
- Never propose clicking an advertisement, sponsored element, reward offer, or CAPTCHA. These actions are prohibited.
- click_* selectors MUST exactly match a selector listed in "controls" and must be an interface control (skip/continue/close), never an ad container.
- Never propose bypassing countdowns, rewarded-link gates, or human verification.
- Prefer "finish" when nothing safe remains. Keep actions under the provided limit.
- Be factual. Do not invent ads, networks, or page outcomes.`;

export async function analyzeWithLlm(
  analysis: PageAnalysis,
  ai: ResolvedAiConfig,
  maxActions: number,
): Promise<AgentAnalysis> {
  const fallback = await analyzeWithHeuristics(analysis, maxActions);
  if (!ai.enabled || !ai.apiKey) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let body: LlmPageResponse | null = null;
  const warnings: string[] = [];
  try {
    const response = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: ai.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              url: analysis.url,
              title: analysis.title,
              description: analysis.description,
              pageTypeHint: analysis.pageType,
              text: analysis.text.slice(0, 3500),
              countdowns: analysis.countdowns,
              captcha: analysis.captcha,
              blocked: analysis.blocked,
              ads: analysis.ads.map((ad) => ({ selector: ad.selector, size: `${ad.width}x${ad.height}`, format: ad.format, text: ad.text })),
              controls: analysis.controls,
              maxActions,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`LLM returned HTTP ${response.status}`);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned an empty response");
    body = extractJsonObject(content) as LlmPageResponse | null;
    if (!body) throw new Error("LLM response was not valid JSON");
  } catch (error) {
    warnings.push(`AI provider unavailable, used heuristic fallback: ${error instanceof Error ? error.message : String(error)}`);
    return { ...fallback, warnings: [...fallback.warnings, ...warnings] };
  } finally {
    clearTimeout(timer);
  }

  const allowedSelectors = new Map(analysis.controls.map((control) => [control.selector, control]));
  const allowedAdSelectors = new Set(analysis.ads.map((ad) => ad.selector));
  const actions: AgentAction[] = [];
  for (const candidate of body.actions ?? []) {
    const type = candidate.type as AgentAction["type"] | undefined;
    if (!type) continue;
    const action: AgentAction = {
      type,
      selector: candidate.selector,
      label: candidate.label,
      reason: candidate.reason,
      ms: candidate.ms,
    };
    const decision = reviewAgentAction(action);
    if (!decision.allowed) {
      warnings.push(`Blocked AI action ${type}: ${decision.reason}`);
      continue;
    }
    if (["click_skip", "click_continue", "click_close"].includes(type)) {
      if (!action.selector || !allowedSelectors.has(action.selector)) {
        warnings.push(`Blocked AI action ${type}: selector was not in the inspected control allowlist`);
        continue;
      }
      action.label = allowedSelectors.get(action.selector)!.label;
    }
    if (action.type === "scroll" && actions.filter((item) => item.type === "scroll").length >= 3) continue;
    if (action.type === "wait" && actions.filter((item) => item.type === "wait").length >= 2) continue;
    actions.push(action);
    if (actions.length >= maxActions) break;
  }
  if (!actions.some((action) => action.type === "finish")) actions.push({ type: "finish", reason: "AI action plan complete" });

  const ads: DetectedAdDraft[] = [...fallback.ads];
  for (const candidate of body.ads ?? []) {
    if (!candidate.selector || !allowedAdSelectors.has(candidate.selector)) continue;
    if (ads.some((ad) => ad.selector === candidate.selector)) continue;
    const raw = analysis.ads.find((ad) => ad.selector === candidate.selector);
    if (!raw) continue;
    ads.push({
      selector: candidate.selector,
      format: (candidate.format || raw.format).slice(0, 30),
      network: candidate.network ? String(candidate.network).slice(0, 60) : detectAdNetwork(raw.signature),
      size: `${raw.width}x${raw.height}`,
      method: "ai",
    });
  }

  const pageTypes: PageAnalysis["pageType"][] = ["landing", "interstitial", "captcha", "blocked", "unavailable", "unknown"];
  const pageType = pageTypes.includes(body.pageType as PageAnalysis["pageType"]) ? (body.pageType as PageAnalysis["pageType"]) : fallback.pageType;
  const summary = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim().slice(0, 800) : fallback.summary;

  return {
    pageType,
    summary,
    ads,
    actions,
    source: "llm",
    model: ai.model,
    warnings,
  };
}

export function isSafeControlHref(control: RawControl): boolean {
  if (!control.href) return true;
  if (control.kind === "close") return true;
  return !control.external;
}
