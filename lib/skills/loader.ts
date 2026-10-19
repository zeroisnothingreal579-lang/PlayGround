import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Skill, SkillFile } from "@/lib/types";
import {
  deleteSkillsNotIn,
  listSkillRows,
  upsertSkill,
} from "@/lib/db/repo";
import { deriveDependencies, parseRepositoryOrder } from "./dependencies";

export const DEFAULT_REPO = "https://github.com/Jakeschincariol/replica-skill";
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface SkillLoadResult {
  skills: Skill[];
  readme: string;
  source: "github" | "bundled" | "cache";
  repoUrl: string;
  commit: string | null;
  warning?: string;
  checkedAt: string;
}

interface GithubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface LoadOptions {
  repoUrl?: string;
  force?: boolean;
  maxAgeMs?: number;
  token?: string;
  skipGithub?: boolean;
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (match) return { owner: match[1], repo: match[2] };
  const simple = cleaned.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };
  throw new Error(`Not a valid GitHub repository URL: ${repoUrl}`);
}

export function parseSkillFrontmatter(content: string, slug: string): {
  name: string;
  description: string;
} {
  try {
    const parsed = matter(content);
    const name =
      typeof parsed.data.name === "string" && parsed.data.name.trim()
        ? parsed.data.name.trim()
        : slug;
    const description =
      typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";
    return { name, description };
  } catch {
    return { name: slug, description: "" };
  }
}

function isScript(filePath: string): boolean {
  return /\.(py|sh|bash|js|mjs|cjs)$/i.test(filePath);
}

function buildSkill(input: {
  slug: string;
  instructions: string;
  files: SkillFile[];
  source: Skill["source"];
  repoUrl: string;
  commit: string | null;
  loadedAt: string;
  allSlugs: string[];
  readme: string;
}): Skill {
  const meta = parseSkillFrontmatter(input.instructions, input.slug);
  const scripts = input.files
    .filter((file) => isScript(file.path) && !file.path.endsWith("SKILL.md"))
    .map((file) => file.path);
  const skill: Skill = {
    slug: input.slug,
    name: meta.name,
    description: meta.description,
    source: input.source,
    repoUrl: input.repoUrl,
    commit: input.commit,
    instructions: input.instructions,
    files: input.files,
    scripts,
    dependencies: [],
    loadedAt: input.loadedAt,
  };
  skill.dependencies = deriveDependencies(skill, input.allSlugs);
  return skill;
}

function readBundledSkills(repoUrl: string): SkillLoadResult {
  const root = path.join(process.cwd(), "content", "replica-skill");
  if (!fs.existsSync(root)) {
    throw new Error(
      "No skills could be loaded. GitHub is unreachable and the bundled snapshot is missing.",
    );
  }
  const readmePath = path.join(root, "README.md");
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^replica-[a-z0-9-]+$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(root, name, "SKILL.md")))
    .sort();

  if (dirs.length === 0) {
    throw new Error("The bundled Replica snapshot contains no SKILL.md files.");
  }

  const loadedAt = new Date().toISOString();
  let commit: string | null = null;
  const snapshotPath = path.join(root, "SNAPSHOT.json");
  if (fs.existsSync(snapshotPath)) {
    try {
      commit = JSON.parse(fs.readFileSync(snapshotPath, "utf8")).commit ?? null;
    } catch {
      commit = null;
    }
  }

  const skills = dirs.map((slug) => {
    const files: SkillFile[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".git") continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
        } else if (entry.isFile()) {
          const relative = path.relative(root, absolute).split(path.sep).join("/");
          const content = fs.readFileSync(absolute, "utf8");
          if (content.length <= 1_000_000) {
            files.push({ path: relative, content, size: content.length });
          }
        }
      }
    };
    walk(path.join(root, slug));
    files.sort((a, b) => a.path.localeCompare(b.path));
    const instructions = files.find((file) => file.path.endsWith("SKILL.md"))?.content || "";
    return buildSkill({
      slug,
      instructions,
      files,
      source: "bundled",
      repoUrl,
      commit,
      loadedAt,
      allSlugs: dirs,
      readme,
    });
  });

  for (const skill of skills) upsertSkill(skill);
  deleteSkillsNotIn(skills.map((skill) => skill.slug));
  return {
    skills,
    readme,
    source: "bundled",
    repoUrl,
    commit,
    warning: "GitHub was unavailable; showing the bundled snapshot of the repository.",
    checkedAt: loadedAt,
  };
}

async function githubRequest<T>(
  url: string,
  token: string | undefined,
  accept = "application/vnd.github+json",
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "replica-studio",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${response.status} ${response.statusText} for ${url}${
        body ? ` — ${body.slice(0, 200)}` : ""
      }`,
    );
  }
  return (await response.json()) as T;
}

async function fetchGithubSkills(repoUrl: string, token?: string): Promise<SkillLoadResult> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const repoInfo = await githubRequest<{ default_branch: string }>(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
  );
  const branch = repoInfo.default_branch || "main";
  const commitInfo = await githubRequest<{ sha: string }>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
    token,
  );
  const commit = commitInfo.sha;
  const tree = await githubRequest<{ tree: GithubTreeEntry[]; truncated?: boolean }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
    token,
  );
  if (tree.truncated) {
    throw new Error("GitHub repository tree is truncated; cannot discover all skill files.");
  }

  const readmeEntry = tree.tree.find((entry) => /^README\.md$/i.test(entry.path));
  let readme = "";
  if (readmeEntry) {
    readme = await fetchBlob(owner, repo, readmeEntry.sha, token);
  }

  const slugs = Array.from(
    new Set(
      tree.tree
        .filter((entry) => entry.type === "blob" && /^replica-[a-z0-9-]+\/SKILL\.md$/.test(entry.path))
        .map((entry) => entry.path.split("/")[0]),
    ),
  ).sort();

  if (slugs.length === 0) {
    throw new Error("No replica-*/SKILL.md files were found in the repository.");
  }

  const loadedAt = new Date().toISOString();
  const entriesBySlug = new Map<string, GithubTreeEntry[]>();
  for (const slug of slugs) entriesBySlug.set(slug, []);
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;
    const slug = entry.path.split("/")[0];
    if (!entriesBySlug.has(slug)) continue;
    if ((entry.size ?? 0) > 1_000_000) continue;
    entriesBySlug.get(slug)!.push(entry);
  }

  const skills: Skill[] = [];
  for (const slug of slugs) {
    const entries = entriesBySlug.get(slug)!;
    const files: SkillFile[] = [];
    const queue = [...entries];
    const concurrency = 6;
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const entry = queue.shift()!;
        const content = await fetchBlob(owner, repo, entry.sha, token);
        files.push({ path: entry.path, content, size: entry.size ?? content.length });
      }
    });
    await Promise.all(workers);
    files.sort((a, b) => a.path.localeCompare(b.path));
    const instructions = files.find((file) => file.path.endsWith("SKILL.md"))?.content || "";
    skills.push(
      buildSkill({
        slug,
        instructions,
        files,
        source: "github",
        repoUrl,
        commit,
        loadedAt,
        allSlugs: slugs,
        readme,
      }),
    );
  }

  for (const skill of skills) upsertSkill(skill);
  deleteSkillsNotIn(skills.map((skill) => skill.slug));
  return { skills, readme, source: "github", repoUrl, commit, checkedAt: loadedAt };
}

async function fetchBlob(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
): Promise<string> {
  const blob = await githubRequest<{ content: string; encoding: string }>(
    `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
    token,
  );
  if (blob.encoding === "base64") return Buffer.from(blob.content, "base64").toString("utf8");
  return blob.content;
}

export async function loadSkillPack(options: LoadOptions = {}): Promise<SkillLoadResult> {
  const repoUrl = options.repoUrl || process.env.REPLICA_REPO_URL || DEFAULT_REPO;
  const cached = listSkillRows();
  const maxAge = options.maxAgeMs ?? CACHE_TTL_MS;
  const cachedFresh =
    cached.length > 0 &&
    Date.now() - new Date(cached[0].loadedAt).getTime() < maxAge;

  if (!options.force && cachedFresh) {
    let readme = "";
    try {
      readme = fs.readFileSync(
        path.join(process.cwd(), "content", "replica-skill", "README.md"),
        "utf8",
      );
    } catch {
      readme = "";
    }
    return {
      skills: cached,
      readme,
      source: "cache",
      repoUrl,
      commit: cached[0].commit,
      checkedAt: cached[0].loadedAt,
    };
  }

  const skipGithub =
    options.skipGithub ?? (process.env.SKIP_GITHUB_SYNC === "true" || !repoUrl);
  if (!skipGithub) {
    try {
      return await fetchGithubSkills(repoUrl, options.token ?? process.env.GITHUB_TOKEN);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown GitHub error";
      if (cached.length) {
        let readme = "";
        try {
          readme = fs.readFileSync(
            path.join(process.cwd(), "content", "replica-skill", "README.md"),
            "utf8",
          );
        } catch {
          readme = "";
        }
        return {
          skills: cached,
          readme,
          source: "cache",
          repoUrl,
          commit: cached[0].commit,
          warning: `GitHub refresh failed (${reason}). Using the last successfully loaded skills.`,
          checkedAt: new Date().toISOString(),
        };
      }
      try {
        const bundled = readBundledSkills(repoUrl);
        return { ...bundled, warning: `GitHub refresh failed (${reason}). ${bundled.warning}` };
      } catch {
        throw new Error(
          `Unable to load skills from GitHub or the bundled snapshot. GitHub error: ${reason}`,
        );
      }
    }
  }

  if (cached.length) {
    let readme = "";
    try {
      readme = fs.readFileSync(
        path.join(process.cwd(), "content", "replica-skill", "README.md"),
        "utf8",
      );
    } catch {
      readme = "";
    }
    return {
      skills: cached,
      readme,
      source: "cache",
      repoUrl,
      commit: cached[0].commit,
      checkedAt: cached[0].loadedAt,
    };
  }
  return readBundledSkills(repoUrl);
}

export function getRepositoryOrder(skills: Skill[], readme: string): string[] {
  return parseRepositoryOrder(readme, skills.map((skill) => skill.slug));
}
