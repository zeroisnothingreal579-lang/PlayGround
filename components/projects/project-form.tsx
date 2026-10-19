"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  FileArchive,
  Loader2,
  Save,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type { Project, TargetKind } from "@/lib/types";
import {
  DEFAULT_APK_MAX_BYTES,
  formatBytes,
  validateApkFile,
} from "@/lib/apk/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type FormState = {
  name: string;
  targetKind: TargetKind;
  targetUrl: string;
  description: string;
  features: string;
  techStack: string;
  designPreferences: string;
  additionalRequirements: string;
};

function initialState(project?: Project): FormState {
  return {
    name: project?.name || "",
    targetKind: project
      ? project.targetKind || (project.targetUrl ? "website" : "apk")
      : "website",
    targetUrl: project?.targetUrl || "",
    description: project?.description || "",
    features: project?.features || "",
    techStack: project?.techStack || "",
    designPreferences: project?.designPreferences || "",
    additionalRequirements: project?.additionalRequirements || "",
  };
}

function uploadApk(
  projectId: string,
  file: File,
  onProgress: (value: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/projects/${projectId}/apk`);
    request.setRequestHeader("Content-Type", "application/vnd.android.package-archive");
    request.setRequestHeader("X-APK-Filename", encodeURIComponent(file.name));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        // Keep the fallback message.
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(data.error || `APK upload failed (${request.status})`));
      }
    });
    request.addEventListener("error", () =>
      reject(new Error("APK upload failed. Check the file and try again.")),
    );
    request.send(file);
  });
}

export function ProjectForm({
  project,
  maxApkBytes = DEFAULT_APK_MAX_BYTES,
}: {
  project?: Project;
  maxApkBytes?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState(project));
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [removeExistingApk, setRemoveExistingApk] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = Boolean(project);
  const existingApk = project?.apk || null;
  const needsApk = form.targetKind === "apk" || form.targetKind === "both";
  const hasApk = Boolean(apkFile) || Boolean(existingApk && !removeExistingApk);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(file: File | null) {
    if (!file) {
      setApkFile(null);
      return;
    }
    const validation = validateApkFile(file, maxApkBytes);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setApkFile(file);
    setRemoveExistingApk(false);
    setUploadProgress(0);
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Project name is required.";
    if ((form.targetKind === "website" || form.targetKind === "both") && !form.targetUrl.trim()) {
      return "A website URL is required for this target type.";
    }
    if (form.targetKind !== "apk" && form.targetUrl.trim()) {
      try {
        const url = new URL(form.targetUrl.trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        return "Target URL must be a valid http(s) URL.";
      }
    }
    if (needsApk && !hasApk) {
      return "Select an APK file for the Android target.";
    }
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setUploadProgress(0);
    let createdProjectId: string | null = null;
    try {
      const response = await fetch(
        editing ? `/api/projects/${project!.id}` : "/api/projects",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            name: form.name.trim(),
            targetUrl: form.targetKind === "apk" ? null : form.targetUrl.trim() || null,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not save project");
      }
      const projectId = editing ? project!.id : data.project.id;
      if (!editing) createdProjectId = projectId;

      if (needsApk && apkFile) {
        await uploadApk(projectId, apkFile, setUploadProgress);
      } else if (editing && existingApk && removeExistingApk) {
        const deleteResponse = await fetch(`/api/projects/${projectId}/apk`, {
          method: "DELETE",
        });
        const deleteData = await deleteResponse.json().catch(() => ({}));
        if (!deleteResponse.ok) {
          throw new Error(deleteData.error || "Could not remove the APK");
        }
      }

      toast.success(editing ? "Project updated" : "Project created");
      router.push(editing ? `/projects/${project!.id}` : `/projects/${projectId}`);
      router.refresh();
    } catch (submitError) {
      if (createdProjectId) {
        await fetch(`/api/projects/${createdProjectId}`, { method: "DELETE" }).catch(
          () => undefined,
        );
      }
      setError(submitError instanceof Error ? submitError.message : "Could not save project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project basics</CardTitle>
          <CardDescription>
            The name and target app every skill will work from.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Project name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. Booking tool for solo consultants"
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetKind">Target type *</Label>
            <Select
              value={form.targetKind}
              onValueChange={(value) => update("targetKind", value as TargetKind)}
            >
              <SelectTrigger id="targetKind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website URL</SelectItem>
                <SelectItem value="apk">Android APK</SelectItem>
                <SelectItem value="both">Website and Android APK</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.targetKind !== "apk" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="targetUrl">
                Target application URL {form.targetKind === "both" ? "*" : ""}
              </Label>
              <Input
                id="targetUrl"
                type="url"
                value={form.targetUrl}
                onChange={(event) => update("targetUrl", event.target.value)}
                placeholder="https://example.com"
              />
              <p className="text-[11px] text-muted-foreground">
                Public pages or your own account only. Never bypass authentication or paywalls.
              </p>
            </div>
          ) : null}

          {needsApk ? (
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Android APK *</Label>
                <span className="text-[11px] text-muted-foreground">
                  .apk only · max {formatBytes(maxApkBytes)}
                </span>
              </div>

              {existingApk && !apkFile ? (
                <div
                  className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    removeExistingApk
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/70 bg-secondary/30"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileArchive className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{existingApk.originalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(existingApk.sizeBytes)} ·{" "}
                        {existingApk.analysis?.status
                          ? `Analysis: ${existingApk.analysis.status}`
                          : "Analysis queued"}
                        {removeExistingApk ? " · will be removed on save" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant={removeExistingApk ? "secondary" : "ghost"}
                      size="sm"
                      aria-label={removeExistingApk ? "Keep the attached APK" : "Remove the attached APK"}
                      onClick={() => setRemoveExistingApk((current) => !current)}
                    >
                      {removeExistingApk ? "Keep" : <X />}
                    </Button>
                  </div>
                </div>
              ) : null}

              {!existingApk || apkFile || removeExistingApk ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInput.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    chooseFile(event.dataTransfer.files?.[0] || null);
                  }}
                  className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                    dragging
                      ? "border-primary bg-primary/10"
                      : "border-border/80 bg-secondary/20 hover:border-primary/60 hover:bg-secondary/40"
                  }`}
                >
                  <UploadCloud className="h-7 w-7 text-primary" />
                  <p className="text-sm font-medium">
                    {apkFile ? apkFile.name : "Drop an APK here or choose a file"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {apkFile
                      ? `${formatBytes(apkFile.size)} selected`
                      : "The APK is stored privately and analyzed statically."}
                  </p>
                </div>
              ) : null}

              <input
                ref={fileInput}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(event) => chooseFile(event.target.files?.[0] || null)}
              />

              {apkFile ? (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{apkFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => chooseFile(null)}
                  >
                    <X /> Clear
                  </Button>
                </div>
              ) : null}

              {saving && apkFile ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Uploading APK</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                Static analysis only. APKs are never installed or executed, and runtime behavior
                is not observed.
              </p>
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Project description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="What are you rebuilding, for whom, and why?"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope and implementation</CardTitle>
          <CardDescription>
            Be specific. This brief is passed into every skill and the full pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="space-y-2">
            <Label htmlFor="features">Features to replicate</Label>
            <Textarea
              id="features"
              value={form.features}
              onChange={(event) => update("features", event.target.value)}
              placeholder={"- Guest booking flow\n- Host availability editor\n- Reschedule and cancel\n- Email reminders"}
              rows={5}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="techStack">Preferred technology stack</Label>
              <Textarea
                id="techStack"
                value={form.techStack}
                onChange={(event) => update("techStack", event.target.value)}
                placeholder="Next.js, TypeScript, Tailwind, Supabase, Stripe"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designPreferences">Design preferences</Label>
              <Textarea
                id="designPreferences"
                value={form.designPreferences}
                onChange={(event) => update("designPreferences", event.target.value)}
                placeholder="Dense dashboard, dark theme, lime accent, tablet-first"
                rows={3}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalRequirements">Additional requirements</Label>
            <Textarea
              id="additionalRequirements"
              value={form.additionalRequirements}
              onChange={(event) => update("additionalRequirements", event.target.value)}
              placeholder="Constraints, out-of-scope areas, legal or brand requirements, launch target…"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" asChild>
          <Link href={editing ? `/projects/${project!.id}` : "/projects"}>
            <ArrowLeft /> Cancel
          </Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Sparkles />}
          {saving
            ? apkFile
              ? `Uploading ${uploadProgress}%…`
              : "Saving…"
            : editing
              ? "Save changes"
              : "Create project"}
        </Button>
      </div>
    </form>
  );
}
