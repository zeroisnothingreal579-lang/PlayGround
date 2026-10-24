import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright-core";
import type { SessionEventType, SessionEvent, SessionOptions } from "../../shared/types.js";
import { config } from "../config.js";
import { clamp, nowIso, sleep } from "../lib/util.js";
import { POLICY, reviewAgentAction, type AgentAction } from "./policy.js";
import {
  analyzePageDom,
  analyzeWithHeuristics,
  analyzeWithLlm,
  isSafeControlHref,
  type AgentAnalysis,
  type DetectedAdDraft,
  type PageAnalysis,
  type RawControl,
} from "./agent.js";
import type { ResolvedAiConfig } from "./settings.js";

export interface AdDraftWithTime extends DetectedAdDraft {
  detectedAt: string;
  visibleMs: number;
  lastVisibleAt: number;
  pageUrl: string | null;
}

export interface RunnerHooks {
  onUpdate(patch: {
    status?: "starting" | "running" | "completed" | "failed" | "stopped";
    agentState?: "idle" | "inspecting" | "acting" | "waiting" | "done";
    currentUrl?: string | null;
    finalUrl?: string | null;
    title?: string | null;
    progress?: number;
    elapsedMs?: number;
    actionsCount?: number;
    adsDetected?: number;
    summary?: string | null;
    error?: string | null;
    endedAt?: string | null;
  }): Promise<void> | void;
  onEvent(event: { type: SessionEventType; level: SessionEvent["level"]; message: string; data?: Record<string, unknown> | null }): Promise<void> | void;
  onAd(ad: AdDraftWithTime): Promise<void> | void;
  onPreview(dataUrl: string): Promise<void> | void;
  registerStop?(stop: () => void): void;
  isPaused(): boolean;
  isStopped(): boolean;
}

export interface RunSessionInput {
  sessionId: string;
  targetUrl: string;
  options: SessionOptions;
  ai: ResolvedAiConfig;
  hooks: RunnerHooks;
  region?: string;
}

export interface RunSessionResult {
  finalUrl: string | null;
  title: string | null;
  summary: string;
  ads: AdDraftWithTime[];
  actions: number;
  elapsedMs: number;
  stopped: boolean;
}

let sharedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  browserPromise ??= (async () => {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: config.browser.headless,
      args: ["--disable-dev-shm-usage", "--disable-background-networking", "--disable-features=OptimizationHints"],
      timeout: 45_000,
    };
    if (config.browser.executablePath) launchOptions.executablePath = config.browser.executablePath;
    if (config.browser.noSandbox) launchOptions.args?.push("--no-sandbox", "--disable-setuid-sandbox");
    const browser = await chromium.launch(launchOptions);
    browser.on("disconnected", () => {
      sharedBrowser = null;
      browserPromise = null;
    });
    sharedBrowser = browser;
    return browser;
  })();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => undefined);
    sharedBrowser = null;
    browserPromise = null;
  }
}

type ProxySettings = NonNullable<BrowserContextOptions["proxy"]>;

function parseProxy(raw: string | null | undefined): ProxySettings | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!["http:", "https:", "socks4:", "socks5:"].includes(url.protocol)) return undefined;
    const server = `${url.protocol}//${url.host}`;
    return {
      server,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return undefined;
  }
}

function browserExecutableError(): string {
  return [
    "Chromium is not available to the automation worker.",
    "Install a Playwright browser (`npx playwright-core install chromium`) or set CHROMIUM_PATH to a Chromium/Chrome executable.",
    "The dashboard, redirect inspector, and analytics remain available without the browser runtime.",
  ].join(" ");
}

async function capturePreview(page: Page, hooks: RunnerHooks): Promise<void> {
  if (page.isClosed()) return;
  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 48, animations: "disabled", timeout: 8000 });
    await hooks.onPreview(`data:image/jpeg;base64,${buffer.toString("base64")}`);
  } catch {
    /* previews are best-effort */
  }
}

function trackingAdKey(ad: DetectedAdDraft): string {
  return `${ad.selector}|${ad.format}|${ad.network ?? ""}`;
}

function updateAdTracking(
  tracking: Map<string, AdDraftWithTime>,
  analysis: PageAnalysis,
  drafts: DetectedAdDraft[],
): AdDraftWithTime[] {
  const now = Date.now();
  const fresh: AdDraftWithTime[] = [];
  const rawBySelector = new Map(analysis.ads.map((ad) => [ad.selector, ad]));
  for (const draft of drafts) {
    const key = trackingAdKey(draft);
    const existing = tracking.get(key);
    const raw = rawBySelector.get(draft.selector);
    if (!existing) {
      const item: AdDraftWithTime = {
        ...draft,
        detectedAt: nowIso(),
        visibleMs: raw?.visible ? 500 : 0,
        lastVisibleAt: raw?.visible ? now : 0,
        pageUrl: analysis.url,
      };
      tracking.set(key, item);
      fresh.push(item);
      continue;
    }
    if (raw?.visible) {
      if (existing.lastVisibleAt > 0) existing.visibleMs += Math.min(7000, now - existing.lastVisibleAt);
      existing.lastVisibleAt = now;
    } else {
      existing.lastVisibleAt = 0;
    }
  }
  return fresh;
}

function chooseNextAction(
  analysis: PageAnalysis,
  plan: AgentAnalysis,
  clickedLabels: Set<string>,
  counters: { waits: number; scrolls: number },
): { action: AgentAction; control?: RawControl } | null {
  for (const action of plan.actions) {
    if (action.type === "finish") continue;
    if (action.type === "wait") {
      if (counters.waits >= 2) continue;
      const decision = reviewAgentAction(action);
      if (!decision.allowed) continue;
      return { action };
    }
    if (action.type === "scroll") {
      if (counters.scrolls >= 3) continue;
      const decision = reviewAgentAction(action);
      if (!decision.allowed) continue;
      return { action };
    }
    if (["click_skip", "click_continue", "click_close"].includes(action.type)) {
      const control = analysis.controls.find((item) => item.selector === action.selector);
      if (!control) continue;
      if (clickedLabels.has(`${control.kind}:${control.label.toLowerCase()}`)) continue;
      if (!isSafeControlHref(control)) continue;
      const reviewed = reviewAgentAction({
        type: action.type as AgentAction["type"],
        selector: control.selector,
        label: control.label,
        reason: action.reason,
      });
      if (!reviewed.allowed) continue;
      return { action: { ...action, label: control.label }, control };
    }
  }
  return null;
}

async function clickControl(page: Page, control: RawControl, hooks: RunnerHooks): Promise<boolean> {
  const selector = control.selector;
  const safe = await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const label = ((element as HTMLElement).innerText || element.getAttribute("aria-label") || "").trim();
      if (!/skip|continue|close|dismiss|no thanks|proceed|next/i.test(label)) return { safe: false, reason: "label changed" };
      const container = element.closest(
        "[data-linkpilot-ad], ins.adsbygoogle, [data-ad], [data-ad-slot], [class*='advert'], [class*='sponsor'], iframe, [aria-label*='advert' i]",
      );
      if (container) return { safe: false, reason: "element is now inside an advertising container" };
      return { safe: true, reason: "ok" };
    })
    .catch(() => ({ safe: false, reason: "control disappeared" }));
  if (!safe.safe) {
    await hooks.onEvent({
      type: "warning",
      level: "warn",
      message: `Refused to click control "${control.label}": ${safe.reason}`,
      data: { selector },
    });
    return false;
  }
  try {
    await page.locator(selector).first().click({ timeout: 5000, noWaitAfter: true });
    return true;
  } catch (error) {
    await hooks.onEvent({
      type: "warning",
      level: "warn",
      message: `Control "${control.label}" could not be clicked: ${error instanceof Error ? error.message : String(error)}`,
      data: { selector },
    });
    return false;
  }
}

async function waitWhilePaused(hooks: RunnerHooks): Promise<void> {
  let pausedLogged = false;
  while (hooks.isPaused() && !hooks.isStopped()) {
    if (!pausedLogged) {
      pausedLogged = true;
      await hooks.onEvent({ type: "system", level: "info", message: "Session paused by operator" });
      await hooks.onUpdate({ agentState: "waiting" });
    }
    await sleep(300);
  }
  if (hooks.isStopped()) throw new DOMException("Stopped", "AbortError");
}

function buildSummary(
  plan: AgentAnalysis,
  analysis: PageAnalysis,
  ads: Map<string, AdDraftWithTime>,
  actions: number,
  clickedCount: number,
): string {
  const parts = [plan.summary.replace(/\.$/, "")];
  const adCount = ads.size;
  parts.push(`${actions} permitted action${actions === 1 ? "" : "s"} executed (${clickedCount} interface control${clickedCount === 1 ? "" : "s"} clicked, 0 advertisements clicked)`);
  parts.push(`${adCount} advertising placement${adCount === 1 ? "" : "s"} detected; no ad impressions were verified`);
  if (analysis.pageType === "captcha") parts.push("Human verification was observed and not bypassed");
  if (analysis.pageType === "blocked") parts.push("The destination returned a blocked page");
  return `${parts.join("; ")}.`;
}

export async function runBrowserSession(input: RunSessionInput): Promise<RunSessionResult> {
  const { sessionId, targetUrl, options, ai, hooks } = input;
  const startedMs = Date.now();
  const maxActions = clamp(options.maxActions ?? ai.maxActions ?? 8, 1, 20);
  const timeoutMs = 35_000;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let stopped = false;
  let actionsExecuted = 0;
  let clickedCount = 0;
  let finalUrl: string | null = targetUrl;
  let title: string | null = null;
  let lastPlan: AgentAnalysis | null = null;
  const ads = new Map<string, AdDraftWithTime>();
  const visitedAdKeys = new Set<string>();
  let llmUsed = false;
  let previewTimer: NodeJS.Timeout | null = null;
  const consoleErrors: string[] = [];

  try {
    try {
      browser = await getBrowser();
    } catch (error) {
      throw new Error(`${browserExecutableError()} ${error instanceof Error ? error.message : ""}`.trim());
    }

    const viewport = options.viewport ?? { width: 1280, height: 800 };
    context = await browser.newContext({
      viewport: {
        width: clamp(viewport.width || 1280, 360, 1920),
        height: clamp(viewport.height || 800, 480, 1200),
      },
      locale: options.locale || "en-US",
      timezoneId: options.timezone || "UTC",
      proxy: parseProxy(options.proxy),
      ignoreHTTPSErrors: false,
      serviceWorkers: "block",
    });
    context.setDefaultTimeout(12_000);
    context.setDefaultNavigationTimeout(timeoutMs);
    await context.addInitScript("globalThis.__name = globalThis.__name || ((target) => target);");
    hooks.registerStop?.(() => {
      stopped = true;
      void context?.close().catch(() => undefined);
    });

    page = await context.newPage();
    context.on("page", (newPage) => {
      if (newPage !== page) {
        void newPage.close().catch(() => undefined);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (consoleErrors.length < 20 && !/favicon/i.test(text)) consoleErrors.push(text.slice(0, 300));
      }
    });

    await hooks.onEvent({
      type: "system",
      level: "info",
      message: "Isolated browser context created",
      data: { viewport, region: input.region ?? config.worker.region, isolated: true, proxy: Boolean(options.proxy) },
    });

    await hooks.onUpdate({ status: "starting", agentState: "inspecting", progress: 4 });
    let responseStatus: number | null = null;
    try {
      const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      responseStatus = response?.status() ?? null;
      const redirects: string[] = [];
      let request = response?.request();
      while (request) {
        const previous = request.redirectedFrom();
        if (previous) redirects.unshift(previous.url());
        request = previous ?? undefined;
      }
      await hooks.onEvent({
        type: "navigation",
        level: "info",
        message: `Loaded ${page.url()}${responseStatus ? ` (HTTP ${responseStatus})` : ""}`,
        data: { status: responseStatus, redirects: [targetUrl, ...redirects, page.url()] },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await hooks.onEvent({
        type: "warning",
        level: "warn",
        message: `Initial navigation did not finish cleanly: ${message.slice(0, 300)}`,
      });
      if (!page.url() || page.url() === "about:blank") {
        throw new Error(`Navigation failed: ${message}`);
      }
    }

    await page.waitForTimeout(900);
    await hooks.onUpdate({
      status: "running",
      currentUrl: page.url(),
      title: await page.title().catch(() => null),
      progress: 10,
    });
    void capturePreview(page, hooks);

    previewTimer = setInterval(() => {
      void capturePreview(page!, hooks);
    }, config.previewIntervalMs);
    previewTimer.unref?.();

    const counters = { waits: 0, scrolls: 0 };
    const clickedLabels = new Set<string>();
    let lastUrl = page.url();

    for (let step = 0; step < maxActions; step += 1) {
      await waitWhilePaused(hooks);
      if (hooks.isStopped()) throw new DOMException("Stopped", "AbortError");

      const analysis = await analyzePageDom(page);
      finalUrl = analysis.url;
      title = analysis.title || null;
      const aiForStep = options.aiEnabled !== false && !llmUsed && ai.enabled && ai.apiKey ? ai : { ...ai, enabled: false };
      const plan = aiForStep.enabled
        ? await analyzeWithLlm(analysis, aiForStep, maxActions - step)
        : await analyzeWithHeuristics(analysis, maxActions - step);
      if (aiForStep.enabled) llmUsed = true;
      lastPlan = plan;

      const freshAds = updateAdTracking(ads, analysis, plan.ads);
      for (const ad of freshAds) {
        const key = trackingAdKey(ad);
        if (visitedAdKeys.has(key)) continue;
        visitedAdKeys.add(key);
        await hooks.onEvent({
          type: "ad",
          level: "info",
          message: `Detected ${ad.format} placement${ad.network ? ` (${ad.network} signature)` : ""} — detection only, no impression verified`,
          data: { format: ad.format, network: ad.network, size: ad.size, selector: ad.selector },
        });
      }
      const currentAds = Array.from(ads.values());
      await hooks.onUpdate({
        status: "running",
        agentState: "inspecting",
        currentUrl: analysis.url,
        finalUrl: analysis.url,
        title: analysis.title || null,
        progress: clamp(12 + step * 9, 10, 88),
        adsDetected: currentAds.length,
        actionsCount: actionsExecuted,
        elapsedMs: Date.now() - startedMs,
      });
      await hooks.onEvent({
        type: "inspection",
        level: "info",
        message:
          step === 0
            ? plan.summary
            : `Page re-inspected: ${analysis.pageType}, ${analysis.ads.length} ad candidate(s), ${analysis.controls.length} permitted control(s)`,
        data: {
          pageType: analysis.pageType,
          ads: currentAds.length,
          controls: analysis.controls.map((control) => control.label),
          countdowns: analysis.countdowns,
          source: plan.source,
          model: plan.model,
          captcha: analysis.captcha,
        },
      });
      if (plan.warnings.length > 0) {
        for (const warning of plan.warnings.slice(0, 5)) {
          await hooks.onEvent({ type: "ai", level: "warn", message: warning });
        }
      }
      if (analysis.url !== lastUrl) {
        await hooks.onEvent({
          type: "navigation",
          level: "info",
          message: `Redirect observed: ${lastUrl} → ${analysis.url}`,
          data: { from: lastUrl, to: analysis.url },
        });
        lastUrl = analysis.url;
      }
      if (analysis.captcha) {
        await hooks.onEvent({
          type: "warning",
          level: "warn",
          message: "Human-verification challenge present. The agent will stop rather than bypass it.",
        });
        break;
      }

      const next = chooseNextAction(analysis, plan, clickedLabels, counters);
      if (!next) {
        await hooks.onEvent({ type: "action", level: "info", message: "No further permitted actions remain" });
        break;
      }

      actionsExecuted += 1;
      const { action, control } = next;
      if (action.type === "wait") {
        counters.waits += 1;
        await hooks.onUpdate({ agentState: "waiting", actionsCount: actionsExecuted });
        await hooks.onEvent({
          type: "action",
          level: "info",
          message: `Waited ${action.ms ?? 3000}ms for countdown/interface transition`,
          data: { action: action.type, reason: action.reason },
        });
        await sleep(action.ms ?? 3000);
      } else if (action.type === "scroll") {
        counters.scrolls += 1;
        await page.evaluate(() => window.scrollBy({ top: Math.round(window.innerHeight * 0.72), behavior: "smooth" }));
        await hooks.onUpdate({ agentState: "acting", actionsCount: actionsExecuted });
        await hooks.onEvent({
          type: "action",
          level: "info",
          message: "Scrolled down to inspect below-the-fold placements",
          data: { action: action.type },
        });
        await page.waitForTimeout(900);
      } else if (control) {
        const before = page.url();
        const clicked = await clickControl(page, control, hooks);
        if (!clicked) {
          actionsExecuted -= 1;
          clickedLabels.add(`${control.kind}:${control.label.toLowerCase()}`);
          continue;
        }
        clickedCount += 1;
        clickedLabels.add(`${control.kind}:${control.label.toLowerCase()}`);
        await hooks.onUpdate({ agentState: "acting", actionsCount: actionsExecuted });
        await hooks.onEvent({
          type: "action",
          level: "success",
          message: `Clicked permitted interface control "${control.label}" (via ${action.type})`,
          data: { action: action.type, label: control.label, selector: control.selector, external: control.external },
        });
        await page.waitForTimeout(1300);
        if (page.url() !== before) {
          await hooks.onEvent({
            type: "navigation",
            level: "info",
            message: `Navigation after control: ${before} → ${page.url()}`,
            data: { from: before, to: page.url() },
          });
        }
      }

      await hooks.onUpdate({
        currentUrl: page.url(),
        finalUrl: page.url(),
        elapsedMs: Date.now() - startedMs,
        actionsCount: actionsExecuted,
      });
      void capturePreview(page, hooks);
    }

    await waitWhilePaused(hooks);
    if (hooks.isStopped()) throw new DOMException("Stopped", "AbortError");

    const finalAnalysis = await analyzePageDom(page).catch(() => null);
    if (finalAnalysis) {
      finalUrl = finalAnalysis.url;
      title = finalAnalysis.title || title;
      updateAdTracking(ads, finalAnalysis, lastPlan?.ads ?? []);
    }
    const adList = Array.from(ads.values());
    for (const ad of adList) await hooks.onAd(ad);
    await hooks.onUpdate({
      status: "completed",
      agentState: "done",
      currentUrl: finalUrl,
      finalUrl,
      title,
      progress: 100,
      adsDetected: adList.length,
      actionsCount: actionsExecuted,
      elapsedMs: Date.now() - startedMs,
      endedAt: nowIso(),
      summary: lastPlan ? buildSummary(lastPlan, finalAnalysis ?? { pageType: "unknown" } as PageAnalysis, ads, actionsExecuted, clickedCount) : "Session finished without a page analysis.",
    });
    if (consoleErrors.length > 0) {
      await hooks.onEvent({
        type: "warning",
        level: "warn",
        message: `Captured ${consoleErrors.length} console error(s) during the session`,
        data: { errors: consoleErrors.slice(0, 5) },
      });
    }
    void capturePreview(page, hooks);
    await hooks.onEvent({
      type: "summary",
      level: "success",
      message: "Session completed. No advertisements were clicked and no impressions were claimed.",
      data: {
        finalUrl,
        actions: actionsExecuted,
        adsDetected: adList.length,
        policyVersion: POLICY.version,
      },
    });

    return {
      finalUrl,
      title,
      summary: lastPlan?.summary ?? "Session completed",
      ads: adList,
      actions: actionsExecuted,
      elapsedMs: Date.now() - startedMs,
      stopped: false,
    };
  } catch (error) {
    stopped = hooks.isStopped() || (error instanceof DOMException && error.name === "AbortError");
    if (!stopped) {
      const message = error instanceof Error ? error.message : String(error);
      await Promise.resolve(hooks.onEvent({ type: "error", level: "error", message: `Session error: ${message.slice(0, 500)}` })).catch(() => undefined);
      await Promise.resolve(hooks.onUpdate({ error: message.slice(0, 800) })).catch(() => undefined);
    }
    if (!stopped) throw error;
    return {
      finalUrl,
      title,
      summary: "Session stopped by operator",
      ads: Array.from(ads.values()),
      actions: actionsExecuted,
      elapsedMs: Date.now() - startedMs,
      stopped: true,
    };
  } finally {
    if (previewTimer) clearInterval(previewTimer);
    await context?.close().catch(() => undefined);
  }
}
