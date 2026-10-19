import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiConfigurationError,
  generateCompletion,
  resolveAiConfig,
} from "@/lib/ai/providers";
import { updateSettings } from "@/lib/db/repo";

const baseConfig = {
  maxOutputTokens: 1024,
  timeoutMs: 5000,
  demo: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
});

describe("AI configuration", () => {
  it("refuses to run without a provider key or explicit demo mode", () => {
    expect(() => resolveAiConfig()).toThrow(AiConfigurationError);
  });

  it("resolves a server-side key without exposing it to the browser", () => {
    process.env.OPENAI_API_KEY = "sk-test-server-only";
    const config = resolveAiConfig({ provider: "openai", model: "test-model" });

    expect(config.provider).toBe("openai");
    expect(config.model).toBe("test-model");
    expect(config.apiKey).toBe("sk-test-server-only");
    expect(config.demo).toBe(false);
  });

  it("only allows demo when it is explicitly enabled", () => {
    expect(() => resolveAiConfig({ provider: "demo", allowDemo: false })).not.toThrow();
    updateSettings({ allowDemoMode: true });
    expect(resolveAiConfig().provider).toBe("demo");
  });

  it("rejects an unknown provider", () => {
    expect(() => resolveAiConfig({ provider: "made-up" })).toThrow(/Unknown AI provider/);
  });
});

describe("OpenAI-compatible requests", () => {
  it("posts messages and parses content and usage", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gpt-test");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toBe("hello");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "generated text" } }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCompletion({
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
      config: {
        ...baseConfig,
        provider: "openai",
        model: "gpt-test",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.test/v1",
      },
    });

    expect(result.content).toBe("generated text");
    expect(result.demo).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces provider HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid key", { status: 401 })),
    );

    await expect(
      generateCompletion({
        system: "system",
        messages: [{ role: "user", content: "hello" }],
        config: {
          ...baseConfig,
          provider: "openai",
          model: "gpt-test",
          apiKey: "bad",
          baseUrl: "https://api.openai.test/v1",
        },
      }),
    ).rejects.toThrow(/401/);
  });

  it("returns a clearly labelled demo response without any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateCompletion({
      system: "You are executing the repository skill: replica-recon.",
      messages: [{ role: "user", content: "Inspect this app" }],
      config: { ...baseConfig, provider: "demo", model: "demo-preview", demo: true },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.demo).toBe(true);
    expect(result.content).toContain("Demo preview");
    expect(result.content).toContain("no AI request was made");
  });
});

describe("Anthropic requests", () => {
  it("uses the messages API headers and parses usage", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        expect(headers.get("x-api-key")).toBe("anthropic-test");
        expect(headers.get("anthropic-version")).toBeTruthy();
        const body = JSON.parse(String(init.body));
        expect(body.system).toBe("system prompt");
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "claude output" }],
            usage: { input_tokens: 8, output_tokens: 4 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await generateCompletion({
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
      config: {
        ...baseConfig,
        provider: "anthropic",
        model: "claude-test",
        apiKey: "anthropic-test",
        baseUrl: "https://anthropic.test",
      },
    });

    expect(result.content).toBe("claude output");
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
  });
});
