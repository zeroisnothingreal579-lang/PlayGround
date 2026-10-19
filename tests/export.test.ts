import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildProjectZip } from "@/lib/export";
import { createProject, upsertProjectFile } from "@/lib/db/repo";

describe("ZIP export", () => {
  it("archives every generated file plus an auditable manifest", async () => {
    const project = createProject({
      name: "My Clone!",
      targetUrl: "https://example.test",
      description: "A test project",
    });
    upsertProjectFile(project.id, "src/app/page.tsx", "export default function Page() {}");
    upsertProjectFile(project.id, "replica/recon.md", "# Recon\n\nFindings");
    upsertProjectFile(project.id, "README.md", "# Project");

    const result = await buildProjectZip(project.id);
    expect(result.filename).toBe("my-clone-replica.zip");
    expect(result.fileCount).toBe(3);
    expect(result.buffer.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(result.buffer);
    expect(zip.file("src/app/page.tsx")).toBeTruthy();
    expect(zip.file("replica/recon.md")).toBeTruthy();
    expect(zip.file("README.md")).toBeTruthy();
    expect(await zip.file("README.md")!.async("string")).toBe("# Project");

    const manifest = JSON.parse(
      await zip.file("replica-studio-manifest.json")!.async("string"),
    );
    expect(manifest.project.name).toBe("My Clone!");
    expect(manifest.files).toHaveLength(3);
    expect(manifest.note).toContain("Target application content was not copied");
  });

  it("throws for a missing project instead of returning an empty archive", async () => {
    await expect(buildProjectZip("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /not found/i,
    );
  });
});
