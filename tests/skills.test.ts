import { describe, expect, it } from "vitest";
import { loadSkillPack, parseSkillFrontmatter } from "@/lib/skills/loader";
import {
  parseRepositoryOrder,
  topoSort,
} from "@/lib/skills/dependencies";
import { planPipeline, missingDependencies } from "@/lib/pipeline/planner";
import type { Skill } from "@/lib/types";

describe("skill loading", () => {
  it("loads the complete bundled Replica pack without network access", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });

    expect(pack.skills).toHaveLength(11);
    expect(pack.source).toBe("bundled");
    expect(pack.commit).toBe("77c9436fb3d18c3d58169efb8caf4fe906b0dc51");
    expect(pack.skills.map((skill) => skill.slug)).toContain("replica-recon");
    expect(pack.skills.every((skill) => skill.instructions.length > 100)).toBe(true);
    expect(pack.skills.every((skill) => skill.files.length > 0)).toBe(true);
  });

  it("parses frontmatter and preserves the repository instructions verbatim", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const recon = pack.skills.find((skill) => skill.slug === "replica-recon")!;
    const meta = parseSkillFrontmatter(recon.instructions, recon.slug);

    expect(meta.name.length).toBeGreaterThan(0);
    expect(recon.instructions).toContain("replica/recon.md");
    expect(recon.dependencies).toEqual([]);
  });

  it("derives real upstream dependencies from skill text", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const bySlug = new Map(pack.skills.map((skill) => [skill.slug, skill]));

    expect(bySlug.get("replica-architect")!.dependencies).toContain("replica-recon");
    expect(bySlug.get("replica-design")!.dependencies).toContain("replica-recon");
    expect(bySlug.get("replica-build")!.dependencies).toEqual(
      expect.arrayContaining(["replica-recon", "replica-architect", "replica-design"]),
    );
    expect(bySlug.get("replica-test")!.dependencies).toEqual(
      expect.arrayContaining(["replica-recon", "replica-build"]),
    );
  });
});

describe("dependency ordering", () => {
  it("uses the README sequence as the baseline order", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const order = parseRepositoryOrder(
      pack.readme,
      pack.skills.map((skill) => skill.slug),
    );

    expect(order[0]).toBe("replica-recon");
    expect(order.indexOf("replica-architect")).toBeLessThan(
      order.indexOf("replica-design"),
    );
    expect(order.indexOf("replica-design")).toBeLessThan(order.indexOf("replica-build"));
    expect(order).toHaveLength(11);
  });

  it("always places prerequisites before dependents", () => {
    const { order, warnings } = topoSort(
      ["build", "recon", "design", "architect"],
      {
        build: ["recon", "architect", "design"],
        design: ["recon"],
        architect: ["recon"],
        recon: [],
      },
      ["recon", "architect", "design", "build"],
    );

    expect(warnings).toEqual([]);
    expect(order).toEqual(["recon", "architect", "design", "build"]);
  });

  it("reports cycles instead of pretending they are valid", () => {
    const { order, warnings } = topoSort(
      ["a", "b"],
      { a: ["b"], b: ["a"] },
      ["a", "b"],
    );

    expect(order).toHaveLength(2);
    expect(warnings.some((warning) => warning.includes("cycle"))).toBe(true);
  });
});

describe("pipeline planning", () => {
  it("pulls in dependencies for selected skills", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const plan = planPipeline({
      skills: pack.skills,
      readme: pack.readme,
      selectedSlugs: ["replica-build"],
      requirements: "Rebuild the landing page",
      projectContextChars: 2000,
    });

    expect(plan.order[0]).toBe("replica-recon");
    expect(plan.order).toEqual(
      expect.arrayContaining(["replica-recon", "replica-architect", "replica-design", "replica-build"]),
    );
    expect(plan.estimatedTokens).toBeGreaterThan(0);
    expect(plan.source).toBe("bundled");
    expect(missingDependencies(plan)).toEqual([]);
  });

  it("plans the full repository sequence when nothing is selected", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const plan = planPipeline({ skills: pack.skills, readme: pack.readme });

    expect(plan.steps).toHaveLength(11);
    expect(plan.steps.at(-1)?.skillSlug).toBe("replica-deploy");
    for (const [index, step] of plan.steps.entries()) {
      for (const dependency of step.dependsOn) {
        expect(plan.order.indexOf(dependency)).toBeLessThan(index);
      }
    }
  });

  it("rejects empty skill packs and empty selections", () => {
    expect(() => planPipeline({ skills: [], readme: "" })).toThrow(/No skills/i);
    const fake = {
      slug: "replica-recon",
      name: "Recon",
      instructions: "",
      dependencies: [],
      source: "bundled",
      files: [],
    } as unknown as Skill;
    expect(() =>
      planPipeline({ skills: [fake], readme: "", selectedSlugs: ["does-not-exist"] }),
    ).toThrow(/selected skills/i);
    expect(() => planPipeline({ skills: [fake], readme: "", selectedSlugs: [] })).toThrow(
      /selected skills/i,
    );
  });
});
