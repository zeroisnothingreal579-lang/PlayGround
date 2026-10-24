import { existsSync } from "node:fs";
import type { AppSettings, AiSettings } from "../../shared/types.js";
import { config } from "../config.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { HttpError } from "../lib/util.js";
import type { Store } from "../store/types.js";

export interface ResolvedAiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxActions: number;
  apiKey: string;
  keySource: "env" | "stored" | "none";
}

export async function resolveAiConfig(store: Store): Promise<ResolvedAiConfig> {
  const raw = await store.getRawSettings();
  const ai = raw.ai ?? {};
  let apiKey = config.llm.apiKey;
  let keySource: "env" | "stored" | "none" = apiKey ? "env" : "none";
  if (!apiKey && ai.apiKeyEncrypted) {
    const decrypted = decryptSecret(ai.apiKeyEncrypted);
    if (decrypted) {
      apiKey = decrypted;
      keySource = "stored";
    }
  }
  return {
    enabled: ai.enabled ?? Boolean(apiKey),
    baseUrl: (ai.baseUrl || config.llm.baseUrl).replace(/\/+$/, ""),
    model: ai.model || config.llm.model,
    temperature: Number.isFinite(ai.temperature) ? Number(ai.temperature) : config.llm.temperature,
    maxActions: Number.isFinite(ai.maxActions) ? Number(ai.maxActions) : 8,
    apiKey,
    keySource,
  };
}

function chromiumAvailable(): boolean {
  return Boolean(config.browser.executablePath && existsSync(config.browser.executablePath));
}

export async function getPublicSettings(store: Store): Promise<AppSettings> {
  const ai = await resolveAiConfig(store);
  const publicAi: AiSettings = {
    enabled: ai.enabled,
    baseUrl: ai.baseUrl,
    model: ai.model,
    temperature: ai.temperature,
    maxActions: ai.maxActions,
    hasApiKey: Boolean(ai.apiKey),
    keySource: ai.keySource,
  };
  return {
    ai: publicAi,
    safety: {
      blockPrivateTargets: config.blockPrivateTargets,
      maxSessionsPerBatch: config.maxSessionsPerBatch,
      maxActiveSessions: config.maxActiveSessions,
      allowAdClicks: false,
      allowArtificialTraffic: false,
    },
    integrations: {
      analyticsConfigured: Boolean(config.analyticsApiKey),
      verifiedImportEnabled: Boolean(config.analyticsApiKey),
      database: store.kind,
    },
    deployment: {
      demoMode: config.demoMode,
      authRequired: config.authRequired,
      region: config.worker.region,
      version: config.version,
      chromiumAvailable: chromiumAvailable(),
    },
  };
}

export interface AiSettingsInput {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxActions?: number;
  apiKey?: string | null;
}

export async function updateAiSettings(store: Store, input: AiSettingsInput): Promise<AppSettings> {
  const raw = await store.getRawSettings();
  const next = { ...(raw.ai ?? {}) };
  if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
  if (input.baseUrl !== undefined) {
    let url: URL;
    try {
      url = new URL(input.baseUrl);
    } catch {
      throw new HttpError(400, "AI base URL must be a valid URL", "invalid_ai_base_url");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new HttpError(400, "AI base URL must use HTTP or HTTPS", "invalid_ai_base_url");
    }
    next.baseUrl = url.href.replace(/\/+$/, "");
  }
  if (input.model !== undefined) {
    if (!/^[a-zA-Z0-9._:/@-]{1,120}$/.test(input.model)) {
      throw new HttpError(400, "Model name contains invalid characters", "invalid_model");
    }
    next.model = input.model;
  }
  if (input.temperature !== undefined) {
    if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
      throw new HttpError(400, "Temperature must be between 0 and 2", "invalid_temperature");
    }
    next.temperature = input.temperature;
  }
  if (input.maxActions !== undefined) {
    if (!Number.isInteger(input.maxActions) || input.maxActions < 1 || input.maxActions > 20) {
      throw new HttpError(400, "maxActions must be between 1 and 20", "invalid_max_actions");
    }
    next.maxActions = input.maxActions;
  }
  if (input.apiKey !== undefined) {
    if (input.apiKey === null || input.apiKey === "") {
      next.apiKeyEncrypted = null;
    } else {
      if (input.apiKey.length < 8 || input.apiKey.length > 400) {
        throw new HttpError(400, "API key length looks invalid", "invalid_api_key");
      }
      next.apiKeyEncrypted = encryptSecret(input.apiKey);
    }
  }
  await store.saveRawSettings({ ...raw, ai: next });
  return getPublicSettings(store);
}
