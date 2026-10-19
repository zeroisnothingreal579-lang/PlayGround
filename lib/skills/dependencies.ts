import type { Skill } from "@/lib/types";

const ARTIFACT_OWNERS: Array<{ prefix: string; owner: string }> = [
  { prefix: "replica/recon.md", owner: "replica-recon" },
  { prefix: "replica/features.csv", owner: "replica-recon" },
  { prefix: "replica/screens/", owner: "replica-recon" },
  { prefix: "replica/architecture.md", owner: "replica-architect" },
  { prefix: "replica/design/", owner: "replica-design" },
  { prefix: "replica/build-log.md", owner: "replica-build" },
  { prefix: "replica/clone-screens/", owner: "replica-build" },
  { prefix: "replica/backend.md", owner: "replica-backend" },
  { prefix: "replica/test-plan.md", owner: "replica-test" },
  { prefix: "replica/bugs.md", owner: "replica-test" },
  { prefix: "replica/parity.md", owner: "replica-diff" },
  { prefix: "replica/reviews.csv", owner: "replica-entrepreneur" },
  { prefix: "replica/feedback.md", owner: "replica-entrepreneur" },
  { prefix: "replica/fixes.md", owner: "replica-entrepreneur" },
  { prefix: "replica/brand.md", owner: "replica-brand" },
  { prefix: "replica/brand.json", owner: "replica-brand" },
  { prefix: "replica/launch/", owner: "replica-launch" },
  { prefix: "replica/deploy.md", owner: "replica-deploy" },
];

const OWNER_ALIASES: Record<string, string> = {
  recon: "replica-recon",
  architect: "replica-architect",
  design: "replica-design",
  build: "replica-build",
  backend: "replica-backend",
  test: "replica-test",
  diff: "replica-diff",
  entrepreneur: "replica-entrepreneur",
  brand: "replica-brand",
  launch: "replica-launch",
  deploy: "replica-deploy",
};

export function normalizeSkillRef(ref: string): string {
  const trimmed = ref.trim().replace(/^\/+/, "").replace(/^replica-skill:/, "");
  if (trimmed.startsWith("replica-")) return trimmed;
  return OWNER_ALIASES[trimmed] || trimmed;
}

/**
 * Derives prerequisites from the repository text itself:
 *  - artifacts the skill says it reads (`replica/...`)
 *  - explicit "after /replica-x" / "run /replica-x first" phrasing
 * No hard-coded fixed order is required here; the repository's README supplies
 * a stable sequence for the pack.
 */
export function deriveDependencies(skill: Skill, allSlugs: string[]): string[] {
  const text = skill.instructions;
  const ownSlug = skill.slug;
  const known = new Set(allSlugs);
  const deps = new Set<string>();

  for (const match of text.matchAll(/replica\/[A-Za-z0-9_./-]+/g)) {
    const artifact = match[0].replace(/[.,;:)\]]+$/, "");
    for (const entry of ARTIFACT_OWNERS) {
      if (artifact === entry.prefix.replace(/\/$/, "") || artifact.startsWith(entry.prefix)) {
        if (entry.owner !== ownSlug && known.has(entry.owner)) deps.add(entry.owner);
      }
    }
  }

  const referencePatterns = [
    /after\s+\/?(?:replica-skill:)?([a-z][a-z-]+)/gi,
    /run\s+\/?(?:replica-skill:)?([a-z][a-z-]+)\s+first/gi,
    /requires?\s+\/?(?:replica-skill:)?([a-z][a-z-]+)/gi,
    /when\s+\/?(?:replica-skill:)?([a-z][a-z-]+)\s+(?:is|has|finishes)/gi,
  ];
  for (const pattern of referencePatterns) {
    for (const match of text.matchAll(pattern)) {
      const dependency = normalizeSkillRef(match[1]);
      if (dependency !== ownSlug && known.has(dependency)) deps.add(dependency);
    }
  }

  return Array.from(deps).sort();
}

/** Parses the sequence declared in the repository README, e.g. recon -> architect -> ... */
export function parseRepositoryOrder(readme: string, slugs: string[]): string[] {
  const known = new Set(slugs);
  const sequenceLine = readme
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("->") && line.includes("replica-"));

  const candidates: string[] = [];
  if (sequenceLine) {
    for (const token of sequenceLine.split("->")) {
      const match = token.match(/replica-[a-z0-9-]+/);
      if (match && known.has(match[0])) candidates.push(match[0]);
    }
  }

  if (candidates.length < slugs.length) {
    const tableRows = Array.from(
      readme.matchAll(/^\|\s*`?\/(replica-[a-z0-9-]+)`?\s*\|/gm),
      (match) => match[1],
    ).filter((slug) => known.has(slug));
    for (const slug of tableRows) if (!candidates.includes(slug)) candidates.push(slug);
  }

  for (const slug of [...slugs].sort()) {
    if (!candidates.includes(slug)) candidates.push(slug);
  }
  return candidates;
}

/**
 * Stable topological sort. `baseOrder` is the repository's declared sequence;
 * it is only used to break ties between otherwise independent skills.
 */
export function topoSort(
  slugs: string[],
  dependencies: Record<string, string[]>,
  baseOrder: string[] = [],
): { order: string[]; warnings: string[] } {
  const known = new Set(slugs);
  const rank = new Map(baseOrder.map((slug, index) => [slug, index]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const slug of slugs) {
    indegree.set(slug, 0);
    dependents.set(slug, []);
  }
  const warnings: string[] = [];
  for (const slug of slugs) {
    const deps = (dependencies[slug] || []).filter((dep) => dep !== slug);
    for (const dep of deps) {
      if (!known.has(dep)) {
        warnings.push(`${slug} references missing prerequisite ${dep}`);
        continue;
      }
      indegree.set(slug, (indegree.get(slug) || 0) + 1);
      dependents.get(dep)!.push(slug);
    }
  }

  const available = slugs.filter((slug) => (indegree.get(slug) || 0) === 0);
  const result: string[] = [];
  while (available.length) {
    available.sort(
      (a, b) =>
        (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER) ||
        a.localeCompare(b),
    );
    const next = available.shift()!;
    result.push(next);
    for (const dependent of dependents.get(next) || []) {
      const remaining = (indegree.get(dependent) || 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) available.push(dependent);
    }
  }

  if (result.length !== slugs.length) {
    const cyclic = slugs.filter((slug) => !result.includes(slug));
    warnings.push(`Dependency cycle detected among: ${cyclic.join(", ")}`);
    result.push(...cyclic.sort());
  }
  return { order: result, warnings };
}
