import fs from "node:fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  createProject,
  deleteApkUpload,
  getApkUploadByProject,
  getProject,
  replaceApkUpload,
} from "@/lib/db/repo";
import { analyzeApk } from "@/lib/apk/analysis";
import { getApkMaxBytes } from "@/lib/apk/config";
import {
  listApkEntries,
  removeStoredApk,
  storeApkStream,
  validateApkArchive,
} from "@/lib/apk/storage";
import { formatBytes, validateApkFile } from "@/lib/apk/shared";

async function zipBuffer(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

function stream(buffer: Buffer): ReadableStream<Uint8Array> {
  return new Blob([new Uint8Array(buffer)]).stream() as ReadableStream<Uint8Array>;
}

describe("APK upload storage", () => {
  it("stores a private file, hashes it, and validates the manifest entry", async () => {
    const project = createProject({ name: "APK storage", targetKind: "apk" });
    const buffer = await zipBuffer({
      "AndroidManifest.xml": "not-a-real-binary-manifest",
      "res/layout/main.xml": "<layout />",
    });
    const stored = await storeApkStream({ projectId: project.id, stream: stream(buffer) });
    expect(stored.sizeBytes).toBe(buffer.length);
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.statSync(stored.filePath).mode & 0o777).toBe(0o600);
    const entries = await validateApkArchive(stored.filePath);
    expect(entries.map((entry) => entry.name)).toContain("AndroidManifest.xml");
    await removeStoredApk(stored.storageKey);
    expect(fs.existsSync(stored.filePath)).toBe(false);
  });

  it("rejects non-ZIP data and archives without AndroidManifest.xml", async () => {
    const project = createProject({ name: "Bad APK", targetKind: "apk" });
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    await expect(
      validateApkArchive(
        (
          await storeApkStream({
            projectId: project.id,
            stream: stream(png),
          })
        ).filePath,
      ),
    ).rejects.toThrow(/valid APK\/ZIP/);

    const noManifest = await zipBuffer({ "res/raw/readme.txt": "hello" });
    await expect(
      validateApkArchive(
        (
          await storeApkStream({
            projectId: project.id,
            stream: stream(noManifest),
          })
        ).filePath,
      ),
    ).rejects.toThrow(/AndroidManifest/);
  });

  it("enforces the configured size limit while streaming", async () => {
    const project = createProject({ name: "Limit", targetKind: "apk" });
    const buffer = Buffer.alloc(2048, 1);
    await expect(
      storeApkStream({ projectId: project.id, stream: stream(buffer), maxBytes: 1024 }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("validates client filenames and formats sizes", () => {
    expect(validateApkFile({ name: "app.apk", size: 10 })).toBeNull();
    expect(validateApkFile({ name: "app.zip", size: 10 })).toMatch(/Only .apk/);
    expect(validateApkFile({ name: "app.apk", size: 0 })).toMatch(/empty/);
    expect(
      validateApkFile({ name: "app.apk", size: getApkMaxBytes() + 1 }, getApkMaxBytes()),
    ).toMatch(/too large/);
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("records a visible failure when the binary manifest cannot be decoded", async () => {
    const project = createProject({ name: "Broken manifest", targetKind: "apk" });
    const buffer = await zipBuffer({ "AndroidManifest.xml": "not-binary-xml" });
    const stored = await storeApkStream({ projectId: project.id, stream: stream(buffer) });
    const { apk } = replaceApkUpload({
      projectId: project.id,
      originalName: "broken.apk",
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      mimeType: "application/vnd.android.package-archive",
    });
    await analyzeApk(apk.id);
    const failed = getApkUploadByProject(project.id)?.analysis;
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBeTruthy();
    expect(failed?.logs.some((log) => log.level === "error")).toBe(true);
  });

  it("joins upload and queued analysis into the project record", async () => {
    const project = createProject({ name: "Joined APK", targetKind: "apk" });
    const buffer = await zipBuffer({ "AndroidManifest.xml": "manifest" });
    const stored = await storeApkStream({ projectId: project.id, stream: stream(buffer) });
    const { apk, previousStorageKey } = replaceApkUpload({
      projectId: project.id,
      originalName: "joined.apk",
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      mimeType: "application/vnd.android.package-archive",
    });
    expect(apk.analysis?.status).toBe("queued");
    expect(getProject(project.id)?.apk?.originalName).toBe("joined.apk");
    expect(previousStorageKey).toBeNull();
    expect(getApkUploadByProject(project.id)?.storageKey).toBe(stored.storageKey);
    deleteApkUpload(project.id);
    expect(getProject(project.id)?.apk).toBeNull();
  });
});

const fixturePath = fs.existsSync("/tmp/fdroid.apk") ? "/tmp/fdroid.apk" : null;

describe.skipIf(!fixturePath)("APK static analysis with a real fixture", () => {
  it("extracts package, SDK, resources, and writes a static report", async () => {
    const project = createProject({ name: "F-Droid", targetKind: "apk" });
    const buffer = fs.readFileSync(fixturePath!);
    const stored = await storeApkStream({ projectId: project.id, stream: stream(buffer) });
    const entries = await validateApkArchive(stored.filePath);
    expect(entries.length).toBeGreaterThan(100);
    const { apk } = replaceApkUpload({
      projectId: project.id,
      originalName: "fdroid.apk",
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      mimeType: "application/vnd.android.package-archive",
    });
    await analyzeApk(apk.id);
    const analyzed = getApkUploadByProject(project.id);
    expect(analyzed?.analysis?.status).toBe("completed");
    expect(analyzed?.analysis?.packageName).toBe("org.fdroid.fdroid");
    expect(analyzed?.analysis?.minSdk).toBe("23");
    expect(analyzed?.analysis?.targetSdk).toBe("30");
    expect(analyzed?.analysis?.reportAvailable).toBe(true);
    expect(analyzed?.analysis?.logs.length).toBeGreaterThan(2);
    expect(await listApkEntries(stored.filePath)).toHaveLength(entries.length);
  }, 30000);
});
