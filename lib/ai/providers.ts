import { getSettings } from "@/lib/db/repo";

export type ProviderId = "openai" | "anthropic" | "openrouter" | "groq" | "ollama" | "demo";

export interface AiConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxOutputTokens: number;
  timeoutMs: number;
  demo: boolean;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiResult {
  content: string;
  provider: ProviderId;
  model: string;
  demo: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

export class AiConfigurationError extends Error {}
export class AiRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "openai/gpt-4.1-mini",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3.2",
  demo: "demo-preview",
};

const KEY_ENV: Record<Exclude<ProviderId, "demo" | "ollama">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
};

const BASE_URL_ENV: Record<ProviderId, string> = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
  groq: "GROQ_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
  demo: "",
};

const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  ollama: "http://127.0.0.1:11434",
  demo: "",
};

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "openrouter", "groq", "ollama", "demo"];

export function getProviderKey(provider: ProviderId): string | undefined {
  if (provider === "demo" || provider === "ollama") return undefined;
  return process.env[KEY_ENV[provider]];
}

export function isProviderConfigured(provider: ProviderId): boolean {
  if (provider === "demo") return true;
  if (provider === "ollama") return Boolean(process.env.OLLAMA_BASE_URL);
  return Boolean(getProviderKey(provider));
}

export function listProviderStatus() {
  return PROVIDERS.map((provider) => ({
    id: provider,
    configured: isProviderConfigured(provider),
    model:
      provider === (process.env.AI_PROVIDER as ProviderId)
        ? process.env.AI_MODEL || DEFAULT_MODELS[provider]
        : DEFAULT_MODELS[provider],
    keyEnv: provider === "demo" || provider === "ollama" ? null : KEY_ENV[provider],
  }));
}

export function resolveAiConfig(overrides: {
  provider?: string;
  model?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  allowDemo?: boolean;
} = {}): AiConfig {
  const settings = getSettings();
  const requested = (
    overrides.provider ||
    settings.aiProvider ||
    process.env.AI_PROVIDER ||
    ""
  ).toLowerCase();
  const demoAllowed =
    overrides.allowDemo ?? (settings.allowDemoMode || process.env.DEMO_MODE === "true");

  let provider: ProviderId;
  if (requested === "demo") {
    provider = "demo";
  } else if (PROVIDERS.includes(requested as ProviderId)) {
    provider = requested as ProviderId;
  } else if (requested) {
    throw new AiConfigurationError(`Unknown AI provider “${requested}”.`);
  } else if (isProviderConfigured("openai")) {
    provider = "openai";
  } else if (isProviderConfigured("anthropic")) {
    provider = "anthropic";
  } else if (isProviderConfigured("openrouter")) {
    provider = "openrouter";
  } else if (isProviderConfigured("groq")) {
    provider = "groq";
  } else if (isProviderConfigured("ollama")) {
    provider = "ollama";
  } else if (demoAllowed) {
    provider = "demo";
  } else {
    throw new AiConfigurationError(
      "No AI provider is configured. Add a server-side API key to .env.local, choose Ollama, or enable Demo previews in Settings.",
    );
  }

  if (provider !== "demo" && !isProviderConfigured(provider)) {
    throw new AiConfigurationError(
      `${provider} is selected but ${provider === "ollama" ? "OLLAMA_BASE_URL" : KEY_ENV[provider as keyof typeof KEY_ENV]} is not set on the server.`,
    );
  }

  const model =
    overrides.model ||
    settings.aiModel ||
    process.env.AI_MODEL ||
    DEFAULT_MODELS[provider];
  if (!model) throw new AiConfigurationError("No AI model is configured.");

  return {
    provider,
    model,
    apiKey: getProviderKey(provider),
    baseUrl:
      process.env[BASE_URL_ENV[provider]] || DEFAULT_BASE_URL[provider] || undefined,
    maxOutputTokens:
      overrides.maxOutputTokens ||
      Number(process.env.AI_MAX_OUTPUT_TOKENS) ||
      settings.maxOutputTokens ||
      8192,
    timeoutMs:
      overrides.timeoutMs ||
      Number(process.env.AI_REQUEST_TIMEOUT_MS) ||
      180000,
    demo: provider === "demo",
  };
}

function demoResponse(system: string, messages: AiMessage[]): string {
  const prompt = messages[messages.length - 1]?.content || "";
  const taskMatch = prompt.match(/TASK\n([\s\S]*?)(?:\n\nATTACHED PROJECT FILES|\n\nUPSTREAM SKILL OUTPUTS|$)/);
  const task = (taskMatch?.[1] || prompt).trim().slice(0, 1200);
  const skillMatch = system.match(/skill:\s*([a-z0-9-]+)/i);
  const skill = skillMatch?.[1] || "replica-skill";
  return [
    "# Demo preview — no AI request was made",
    "",
    "This is a clearly-labelled local preview. Configure a provider key to run real AI execution.",
    "",
    `**Skill:** \`${skill}\``,
    "",
    `**Task brief:** ${task}`,
    "",
    "## Preview plan",
    "",
    "1. Read the repository skill instructions and the selected project context.",
    "2. Produce the requested artifact with traceable assumptions.",
    "3. Save a demo artifact so the workspace flow can be inspected.",
    "",
    "### Demo artifact",
    "",
    'The preview writes `replica/demo-preview.md`. No model was called.',
    "",
    '<file path="replica/demo-preview.md">',
    "# Demo preview",
    "",
    "No model was called. This file exists only because Demo mode is enabled.",
    "</file>",
  ].join("\n");
}

async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("AI request timed out")), timeoutMs);
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function generateCompletion(input: {
  system: string;
  messages: AiMessage[];
  config?: AiConfig;
  signal?: AbortSignal;
}): Promise<AiResult> {
  const config = input.config || resolveAiConfig();
  if (config.demo) {
    return {
      content: demoResponse(input.system, input.messages),
      provider: "demo",
      model: config.model,
      demo: true,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  return withTimeout(config.timeoutMs, input.signal, async (signal) => {
    if (config.provider === "anthropic") {
      return callAnthropic(config, input.system, input.messages, signal);
    }
    return callOpenAiCompatible(config, input.system, input.messages, signal);
  });
}

async function callOpenAiCompatible(
  config: AiConfig,
  system: string,
  messages: AiMessage[],
  signal: AbortSignal,
): Promise<AiResult> {
  const base = (config.baseUrl || "").replace(/\/$/, "");
  const endpoint = config.provider === "ollama" ? `${base}/api/chat` : `${base}/chat/completions`;
  const body =
    config.provider === "ollama"
      ? {
          model: config.model,
          stream: false,
          messages: [{ role: "system", content: system }, ...messages],
          options: { num_predict: config.maxOutputTokens },
        }
      : {
          model: config.model,
          max_tokens: config.maxOutputTokens,
          messages: [{ role: "system", content: system }, ...messages],
        };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "Replica Studio";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AiRequestError(
      `${config.provider} returned ${response.status}: ${text.slice(0, 500) || response.statusText}`,
      response.status,
    );
  }
  const data = (await response.json()) as any;
  const content =
    config.provider === "ollama"
      ? data.message?.content
      : data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiRequestError(`${config.provider} returned an empty response.`);
  }
  return {
    content,
    provider: config.provider,
    model: config.model,
    demo: false,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? data.prompt_eval_count ?? 0,
      outputTokens: data.usage?.completion_tokens ?? data.eval_count ?? 0,
    },
  };
}

async function callAnthropic(
  config: AiConfig,
  system: string,
  messages: AiMessage[],
  signal: AbortSignal,
): Promise<AiResult> {
  const base = (config.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const response = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxOutputTokens,
      system,
      messages,
    }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AiRequestError(
      `anthropic returned ${response.status}: ${text.slice(0, 500) || response.statusText}`,
      response.status,
    );
  }
  const data = (await response.json()) as any;
  const content = (data.content || [])
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");
  if (!content.trim()) throw new AiRequestError("anthropic returned an empty response.");
  return {
    content,
    provider: "anthropic",
    model: config.model,
    demo: false,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

export function providerSetupMessage(): string {
  return "Add OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY to .env.local, or run Ollama locally. Keys stay on the server.";
}
