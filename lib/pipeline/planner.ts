import type { PipelinePlan, PipelinePlanStep, Skill } from "@/lib/types";
import { parseRepositoryOrder, topoSort } from "@/lib/skills/dependencies";

export interface PlanInput {
  skills: Skill[];
  readme: string;
  requirements?: string;
  selectedSlugs?: string[];
  projectContextChars?: number;
}

export class PipelinePlanningError extends Error {}

function dependencyReason(skill: Skill, dependency: string): string {
  const dep = dependency.replace("replica-", "");
  return `Needs ${dependency} (${dep}) output before it can run`;
}

/**
 * Builds a dependency-aware execution plan from the real instructions.
 * The repository's own README sequence is the stable ordering baseline; the
 * graph is derived from each SKILL.md's artifact and prerequisite references.
 */
export function planPipeline(input: PlanInput): PipelinePlan {
  if (input.skills.length === 0) {
    throw new PipelinePlanningError("No skills loaded. Sync the repository first.");
  }

  const known = new Map(input.skills.map((skill) => [skill.slug, skill]));
  const baseOrder = parseRepositoryOrder(
    input.readme,
    input.skills.map((skill) => skill.slug),
  );

  const selected =
    input.selectedSlugs !== undefined
      ? input.selectedSlugs.filter((slug) => known.has(slug))
      : input.skills.map((skill) => skill.slug);

  if (selected.length === 0) {
    throw new PipelinePlanningError("None of the selected skills are available.");
  }

  const dependencies: Record<string, string[]> = {};
  for (const slug of selected) {
    dependencies[slug] = (known.get(slug)?.dependencies || []).filter((dep) => known.has(dep));
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const slug of [...selected]) {
      for (const dependency of dependencies[slug] || []) {
        if (!selected.includes(dependency)) {
          selected.push(dependency);
          dependencies[dependency] = (known.get(dependency)?.dependencies || []).filter((dep) =>
            known.has(dep),
          );
          changed = true;
        }
      }
    }
  }

  const { order, warnings } = topoSort(selected, dependencies, baseOrder);
  const contextChars = input.projectContextChars || 0;
  const requirementChars = input.requirements?.length || 0;

  const steps: PipelinePlanStep[] = order.map((slug, index) => {
    const skill = known.get(slug)!;
    const deps = dependencies[slug] || [];
    return {
      skillSlug: slug,
      name: skill.name,
      position: index,
      dependsOn: deps,
      reason: deps.length
        ? deps.map((dep) => dependencyReason(skill, dep)).join("; ")
        : "No upstream prerequisites; starts from project context",
    };
  });

  const estimatedTokens = steps.reduce((total, step) => {
    const skill = known.get(step.skillSlug)!;
    const promptChars =
      skill.instructions.length +
      Math.ceil(contextChars / Math.max(steps.length, 1)) +
      Math.ceil(requirementChars / Math.max(steps.length, 1)) +
      1200;
    return total + Math.ceil(promptChars / 4);
  }, 0);

  return {
    steps,
    order,
    warnings,
    estimatedTokens,
    source: input.skills[0].source,
    createdAt: new Date().toISOString(),
  };
}

export function missingDependencies(plan: PipelinePlan): string[] {
  const available = new Set(plan.order);
  const missing: string[] = [];
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!available.has(dep)) missing.push(`${step.skillSlug} -> ${dep}`);
    }
  }
  return missing;
}
