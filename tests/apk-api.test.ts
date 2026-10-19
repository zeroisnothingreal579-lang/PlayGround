import { describe, expect, it } from "vitest";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import {
  DELETE as deleteApkRoute,
  POST as uploadApkRoute,
} from "@/app/api/projects/[id]/apk/route";
import { createProject, replaceApkUpload } from "@/lib/db/repo";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("APK project API", () => {
  it("allows an APK-only project but requires a URL for website targets", async () => {
    const apkOnly = await createProjectRoute(
      jsonRequest("http://localhost/api/projects", {
        name: "APK only",
        targetKind: "apk",
      }),
    );
    expect(apkOnly.status).toBe(201);
    expect((await apkOnly.json()).project.targetKind).toBe("apk");

    const website = await createProjectRoute(
      jsonRequest("http://localhost/api/projects", {
        name: "Website missing URL",
        targetKind: "website",
      }),
    );
    expect(website.status).toBe(422);
  });

  it("rejects uploads without a valid APK filename or within the size limit", async () => {
    const project = createProject({ name: "Upload validation", targetKind: "apk" });
    const wrongType = await uploadApkRoute(
      new Request(`http://localhost/api/projects/${project.id}/apk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-APK-Filename": encodeURIComponent("archive.zip"),
        },
        body: new Uint8Array([1, 2, 3]),
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(wrongType.status).toBe(422);

    const tooLarge = await uploadApkRoute(
      new Request(`http://localhost/api/projects/${project.id}/apk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(1024 * 1024 * 1024),
          "X-APK-Filename": encodeURIComponent("app.apk"),
        },
        body: new Uint8Array([1, 2, 3]),
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(tooLarge.status).toBe(413);
  });

  it("refuses to remove the only target input", async () => {
    const project = createProject({ name: "Only APK", targetKind: "apk" });
    replaceApkUpload({
      projectId: project.id,
      originalName: "only.apk",
      storageKey: `${project.id}/only.apk`,
      sizeBytes: 100,
      sha256: "a".repeat(64),
      mimeType: "application/vnd.android.package-archive",
    });
    const response = await deleteApkRoute(
      new Request(`http://localhost/api/projects/${project.id}/apk`, { method: "DELETE" }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(response.status).toBe(409);
  });
});
