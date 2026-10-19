import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, getWorkspaceStats, updateSettings } from "@/lib/db/repo";
import { listProviderStatus } from "@/lib/ai/providers";
import { getSandboxStatus } from "@/lib/sandbox";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const settingsSchema = z.object({
  repoUrl: z.string().trim().url().max(2000).optional(),
  aiProvider: z
    .enum(["", "openai", "anthropic", "openrouter", "groq", "ollama", "demo"])
    .optional(),
  aiModel: z.string().trim().max(200).optional(),
  storage: z.literal("sqlite").optional(),
  executionTimeoutMs: z.number().int().min(1000).max(120000).optional(),
  maxOutputTokens: z.number().int().min(256).max(64000).optional(),
  sandboxMode: z.enum(["docker", "disabled"]).optional(),
  allowDemoMode: z.boolean().optional(),
});

function payload() {
  const settings = getSettings();
  const providers = listProviderStatus();
  return {
    settings,
    providers: providers.map(({ id, configured, model, keyEnv }) => ({
      id,
      configured,
      model,
      keyEnv,
    })),
    keys: {
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
      OLLAMA_BASE_URL: Boolean(process.env.OLLAMA_BASE_URL),
    },
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    supabaseConfigured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    sandbox: getSandboxStatus(true),
    stats: getWorkspaceStats(),
    storagePath: process.env.DATABASE_PATH || "./data/replica-studio.db",
  };
}

export async function GET() {
  try {
    return NextResponse.json(payload());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = settingsSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid settings", 422, parsed.error.issues);
    updateSettings(parsed.data);
    return NextResponse.json(payload());
  } catch (error) {
    return handleApiError(error);
  }
}
