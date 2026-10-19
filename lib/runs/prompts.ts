import type { Project, ProjectFile, Skill } from "@/lib/types";

const MAX_FILE_CHARS = 40_000;
const MAX_CONTEXT_CHARS = 160_000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildSkillPrompt(input: {
  skill: Skill;
  project: Project;
  task: string;
  attachedFiles: ProjectFile[];
  priorOutputs?: { skillSlug: string; output: string }[];
  apkContext?: string | null;
}): { system: string; user: string } {
  const { skill, project, task } = input;
  const system = [
    `You are Replica Studio executing the repository skill: ${skill.slug}.`,
    "Follow the SKILL.md instructions below exactly. They are the source of truth.",
    "You are working inside the user's project named “" + project.name + "”.",
    "Respect the Replica pack rules: clean-room functionality only, public sources or the user's own account only, never bypass authentication, paywalls, or access controls, never copy proprietary code, assets, logos, or copy.",
    "Do not claim work was performed that you did not perform. State assumptions and blockers plainly.",
    "",
    "OUTPUT FORMAT",
    "Return a clear narrative response first. For every file the project should save, use exactly:",
    '<file path="relative/path/from/project/root">',
    "file contents",
    "</file>",
    "Never write outside the project, never use absolute paths or '..', and never write .env files.",
    "You may create or update multiple files. Do not wrap the <file> markers in code fences.",
    "",
    "--- REPOSITORY SKILL INSTRUCTIONS ---",
    skill.instructions,
    "--- END SKILL INSTRUCTIONS ---",
    "",
    "Skill support files available in the repository:",
    skill.files
      .filter((file) => !file.path.endsWith("SKILL.md"))
      .map((file) => `- ${file.path} (${file.size} bytes)`)
      .join("\n") || "(none)",
  ].join("\n");

  const projectContext = [
    `Project: ${project.name}`,
    project.targetUrl ? `Target application URL: ${project.targetUrl}` : "",
    project.description ? `Description: ${project.description}` : "",
    project.features ? `Features to replicate:\n${project.features}` : "",
    project.techStack ? `Preferred stack: ${project.techStack}` : "",
    project.designPreferences ? `Design preferences: ${project.designPreferences}` : "",
    project.additionalRequirements
      ? `Additional requirements:\n${project.additionalRequirements}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let usedChars = 0;
  const attached = input.attachedFiles
    .map((file) => {
      if (usedChars >= MAX_CONTEXT_CHARS) return "";
      const content = file.content.slice(0, MAX_FILE_CHARS);
      usedChars += content.length;
      const truncated = file.content.length > MAX_FILE_CHARS ? "\n[truncated]" : "";
      return `### ${file.path}\n${content}${truncated}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const prior = (input.priorOutputs || [])
    .map((item) => {
      if (usedChars >= MAX_CONTEXT_CHARS) return "";
      const content = item.output.slice(0, 30_000);
      usedChars += content.length;
      return `### Output from ${item.skillSlug}\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const user = [
    "PROJECT CONTEXT",
    projectContext,
    "",
    "TASK",
    task,
    "",
    input.apkContext ? input.apkContext : "",
    attached ? `ATTACHED PROJECT FILES\n\n${attached}` : "",
    prior ? `UPSTREAM SKILL OUTPUTS\n\n${prior}` : "",
    "",
    "Produce the artifact this skill requires. Save every durable deliverable as a <file> block.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export function parseGeneratedFiles(output: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const seen = new Set<string>();
  const pattern = /<file\s+path\s*=\s*["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi;
  for (const match of output.matchAll(pattern)) {
    const filePath = match[1].trim();
    const content = match[2].replace(/^\n/, "").replace(/\n$/, "");
    if (!seen.has(filePath)) {
      seen.add(filePath);
      files.push({ path: filePath, content });
    }
  }

  if (files.length === 0) {
    const fencePattern = /```[a-zA-Z0-9_-]*\s+(?:filename|file|path)=["']?([^"'\s]+)["']?\n([\s\S]*?)```/g;
    for (const match of output.matchAll(fencePattern)) {
      const filePath = match[1].trim();
      if (!seen.has(filePath)) {
        seen.add(filePath);
        files.push({ path: filePath, content: match[2] });
      }
    }
  }
  return files;
}

export function relevantFilesForStep(files: ProjectFile[], skillSlugs: string[]): ProjectFile[] {
  const prefixes: Record<string, string[]> = {
    "replica-recon": ["replica/recon", "replica/features", "replica/screens/"],
    "replica-architect": ["replica/architecture", "replica/recon", "replica/features"],
    "replica-design": ["replica/design/", "replica/recon", "replica/screens/"],
    "replica-build": ["replica/", "src/", "app/", "components/", "package.json"],
    "replica-backend": ["replica/architecture", "replica/recon", "app/api/", "lib/", "supabase/"],
    "replica-test": ["replica/recon", "replica/test-plan", "tests/", "e2e/", "package.json"],
    "replica-diff": ["replica/features", "replica/parity", "replica/clone-screens/"],
    "replica-entrepreneur": ["replica/recon", "replica/feedback", "replica/reviews"],
    "replica-brand": ["replica/fixes", "replica/design/", "replica/brand", "replica/recon"],
    "replica-launch": ["replica/fixes", "replica/brand", "replica/launch/", "replica/design/"],
    "replica-deploy": ["replica/", "package.json"],
  };
  const allowed = skillSlugs.flatMap((slug) => prefixes[slug] || []);
  const selected = files.filter((file) =>
    allowed.some((prefix) => file.path === prefix || file.path.startsWith(prefix)),
  );
  return selected.slice(0, 30);
}
