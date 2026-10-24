import type { PolicyDocument } from "../../shared/types.js";

export const POLICY: PolicyDocument = {
  version: "2026-10-1",
  updatedAt: "2026-10-24T00:00:00.000Z",
  allowed: [
    "inspect_page_dom",
    "record_redirect_chain",
    "scroll_page",
    "wait_for_countdown",
    "click_skip_control",
    "click_continue_control",
    "click_close_overlay",
    "follow_ordinary_redirects",
    "detect_ad_placements",
    "measure_ad_visibility",
    "capture_page_preview",
    "summarize_session",
  ],
  blocked: [
    "click_advertisement",
    "click_sponsored_link",
    "bypass_rewarded_link_step",
    "auto_complete_rewarded_offer",
    "solve_or_bypass_captcha",
    "generate_artificial_traffic",
    "rotate_identity_to_simulate_humans",
    "fabricate_visits_clicks_impressions_or_revenue",
    "evade_platform_rate_limits_or_access_controls",
  ],
  statements: [
    "Sessions are automated QA workers, not human visitors. They are never reported to advertisers or shortener platforms as genuine traffic.",
    "The agent may detect, measure, and log advertising placements, but it never clicks an advertisement or sponsored element.",
    "Rewarded links, countdown gates, and human-verification challenges are recorded, not bypassed. CAPTCHAs are never solved automatically.",
    "Analytics show measured automation activity. Verified visits, clicks, impressions, and earnings appear only when imported from an authorized platform API.",
    "Network and proxy configuration exists for regional compatibility testing and must comply with the target platform's terms.",
  ],
};

export type AgentActionType =
  | "inspect"
  | "scroll"
  | "wait"
  | "click_skip"
  | "click_continue"
  | "click_close"
  | "finish";

export interface AgentAction {
  type: AgentActionType;
  selector?: string;
  label?: string;
  reason?: string;
  ms?: number;
}

const ALLOWED_ACTIONS = new Set<AgentActionType>(POLICY.allowed.includes("click_close_overlay") ? ["inspect", "scroll", "wait", "click_skip", "click_continue", "click_close", "finish"] : []);

const FORBIDDEN_TERMS = [
  "advert",
  "sponsor",
  "promoted",
  "reward",
  "offer",
  "payout",
  "captcha",
  "verify you are human",
  "claim",
  "earn",
  "paid",
  "ad-",
  "adsbygoogle",
  "doubleclick",
  "taboola",
  "outbrain",
  "propeller",
  "adsterra",
  "popads",
  "monetag",
];

const AD_CONTAINER_PATTERN =
  /(^|[\s_#.\[\]])(ad|ads|advert|advertisement|sponsor|sponsored|promo|promoted|taboola|outbrain|adsbygoogle)([\s_\-\].]|$)|adsbygoogle|doubleclick|adsterra|propeller|popads|monetag/i;

export interface ActionDecision {
  allowed: boolean;
  reason: string;
}

export function reviewAgentAction(action: AgentAction): ActionDecision {
  if (!ALLOWED_ACTIONS.has(action.type)) {
    return { allowed: false, reason: `Action type "${action.type}" is outside the permitted action set` };
  }
  const label = `${action.label ?? ""} ${action.reason ?? ""} ${action.selector ?? ""}`.toLowerCase();
  if (action.type === "wait") {
    if (action.ms !== undefined && (action.ms < 0 || action.ms > 15000)) {
      return { allowed: false, reason: "Wait duration must be between 0 and 15 seconds" };
    }
    return { allowed: true, reason: "Permitted passive wait" };
  }
  if (["click_skip", "click_continue", "click_close"].includes(action.type)) {
    if (!action.selector) return { allowed: false, reason: "Click actions require a concrete selector" };
    if (AD_CONTAINER_PATTERN.test(label)) return { allowed: false, reason: "Control is inside or describes an advertising container" };
    if (FORBIDDEN_TERMS.some((term) => label.includes(term))) {
      return { allowed: false, reason: "Control text indicates advertising, rewards, or human verification" };
    }
    return { allowed: true, reason: "Permitted interface control outside ad containers" };
  }
  return { allowed: true, reason: "Permitted inspection action" };
}

export function isAdContainerDescriptor(descriptor: string): boolean {
  return AD_CONTAINER_PATTERN.test(descriptor);
}

export function policySummary(): PolicyDocument {
  return POLICY;
}
