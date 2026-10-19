import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings, getWorkspaceStats, listRuns } from "@/lib/db/repo";
import { listProviderStatus } from "@/lib/ai/providers";
import { getSandboxStatus } from "@/lib/sandbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const settings = getSettings();
  const providers = listProviderStatus();
  const keys = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
    GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
    OLLAMA_BASE_URL: Boolean(process.env.OLLAMA_BASE_URL),
    GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const runs = listRuns({ limit: 1000 });
  const usageTokens = runs.reduce((total, run) => total + run.estimatedTokens, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Repository source, server-side AI credentials, durable storage, sandbox status, and execution limits."
      />
      <div className="max-w-5xl">
        <SettingsForm
          settings={settings}
          providers={providers}
          keys={keys}
          sandbox={getSandboxStatus()}
          storagePath={process.env.DATABASE_PATH || "./data/replica-studio.db"}
          supabaseConfigured={Boolean(
            process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
          )}
          stats={getWorkspaceStats()}
          usageTokens={usageTokens}
        />
      </div>
    </div>
  );
}
