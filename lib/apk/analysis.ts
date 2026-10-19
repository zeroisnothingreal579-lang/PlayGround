import path from "node:path";
import ApkReader, { type ApkManifest } from "@devicefarmer/adbkit-apkreader";
import AppInfoParser, { type ParsedApkInfo } from "app-info-parser";
import {
  addActivity,
  appendApkAnalysisLog,
  getApkAnalysis,
  getApkUpload,
  updateApkAnalysis,
} from "@/lib/db/repo";
import { getStoredApkPath, listApkEntries, type ApkEntry } from "./storage";
import { formatBytes } from "./shared";

const MAX_LISTED_RESOURCES = 25_000;

interface ResourceSummary {
  resourceFileCount: number;
  resourceBytes: number;
  resourceFiles: { path: string; bytes: number; extension: string }[];
  truncated: boolean;
  groups: Record<string, { count: number; bytes: number }>;
  extensions: Record<string, number>;
  locales: string[];
  hasResourcesArsc: boolean;
  appLabelResource: string | null;
  iconCandidates: string[];
}

interface StructureSummary {
  entryCount: number;
  fileCount: number;
  directoryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  topLevel: Record<string, { files: number; bytes: number }>;
  dexFiles: { path: string; bytes: number }[];
  nativeLibraries: Record<string, { files: number; bytes: number }>;
  assets: { path: string; bytes: number }[];
  signatureFiles: string[];
  largestFiles: { path: string; bytes: number }[];
}

function extensionOf(name: string): string {
  const ext = path.posix.extname(name).toLowerCase();
  return ext ? ext.slice(1) : "(none)";
}

function emptyStructure(entries: ApkEntry[]): StructureSummary {
  const structure: StructureSummary = {
    entryCount: entries.length,
    fileCount: 0,
    directoryCount: 0,
    compressedBytes: 0,
    uncompressedBytes: 0,
    topLevel: {},
    dexFiles: [],
    nativeLibraries: {},
    assets: [],
    signatureFiles: [],
    largestFiles: [],
  };
  for (const entry of entries) {
    if (entry.isDirectory) {
      structure.directoryCount += 1;
      continue;
    }
    structure.fileCount += 1;
    structure.compressedBytes += entry.compressedSize;
    structure.uncompressedBytes += entry.uncompressedSize;
    const segments = entry.name.split("/");
    const top = segments[0] || "(root)";
    structure.topLevel[top] ||= { files: 0, bytes: 0 };
    structure.topLevel[top].files += 1;
    structure.topLevel[top].bytes += entry.uncompressedSize;
    if (/^classes\d*\.dex$/i.test(entry.name) || /^assets\/.*\.dex$/i.test(entry.name)) {
      structure.dexFiles.push({ path: entry.name, bytes: entry.uncompressedSize });
    }
    if (segments[0] === "lib" && segments[1]) {
      structure.nativeLibraries[segments[1]] ||= { files: 0, bytes: 0 };
      structure.nativeLibraries[segments[1]].files += 1;
      structure.nativeLibraries[segments[1]].bytes += entry.uncompressedSize;
    }
    if (segments[0] === "assets") {
      if (structure.assets.length < 5000) {
        structure.assets.push({ path: entry.name, bytes: entry.uncompressedSize });
      }
    }
    if (segments[0] === "META-INF" && /\.(rsa|dsa|ec|sf|mf)$/i.test(entry.name)) {
      structure.signatureFiles.push(entry.name);
    }
  }
  structure.largestFiles = entries
    .filter((entry) => !entry.isDirectory)
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize)
    .slice(0, 20)
    .map((entry) => ({ path: entry.name, bytes: entry.uncompressedSize }));
  return structure;
}

function summarizeResources(entries: ApkEntry[], info: ParsedApkInfo | null): ResourceSummary {
  const resourceFiles = entries.filter(
    (entry) => !entry.isDirectory && entry.name.startsWith("res/"),
  );
  const groups: Record<string, { count: number; bytes: number }> = {};
  const extensions: Record<string, number> = {};
  const locales = new Set<string>();
  let bytes = 0;
  for (const entry of resourceFiles) {
    bytes += entry.uncompressedSize;
    const segments = entry.name.split("/");
    const group = segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0];
    groups[group] ||= { count: 0, bytes: 0 };
    groups[group].count += 1;
    groups[group].bytes += entry.uncompressedSize;
    const ext = extensionOf(entry.name);
    extensions[ext] = (extensions[ext] || 0) + 1;
    if (segments[1]?.startsWith("values-")) locales.add(segments[1].slice(7));
  }
  const sorted = resourceFiles
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_LISTED_RESOURCES)
    .map((entry) => ({
      path: entry.name,
      bytes: entry.uncompressedSize,
      extension: extensionOf(entry.name),
    }));
  return {
    resourceFileCount: resourceFiles.length,
    resourceBytes: bytes,
    resourceFiles: sorted,
    truncated: resourceFiles.length > MAX_LISTED_RESOURCES,
    groups,
    extensions,
    locales: [...locales].sort(),
    hasResourcesArsc: entries.some(
      (entry) => !entry.isDirectory && entry.name.toLowerCase() === "resources.arsc",
    ),
    appLabelResource:
      typeof info?.application?.label?.[0] === "string" ? info.application.label[0] : null,
    iconCandidates: (info?.application?.icon || []).filter(
      (value): value is string => typeof value === "string",
    ),
  };
}

function manifestSummary(manifest: ApkManifest) {
  const app = manifest.application || {};
  return {
    package: manifest.package || null,
    versionCode: manifest.versionCode ?? null,
    versionName: manifest.versionName ?? null,
    compileSdkVersion: manifest.compileSdkVersion ?? null,
    compileSdkVersionCodename: manifest.compileSdkVersionCodename ?? null,
    minSdkVersion: manifest.usesSdk?.minSdkVersion ?? null,
    targetSdkVersion: manifest.usesSdk?.targetSdkVersion ?? null,
    maxSdkVersion: manifest.usesSdk?.maxSdkVersion ?? null,
    installLocation: manifest.installLocation ?? null,
    permissions: (manifest.usesPermissions || [])
      .map((permission) => permission.name)
      .filter(Boolean),
    declaredPermissions: (manifest.permissions || [])
      .map((permission) => permission.name)
      .filter(Boolean),
    features: manifest.usesFeatures || [],
    supportsScreens: manifest.supportsScreens || null,
    compatibleScreens: manifest.compatibleScreens || [],
    glTextures: manifest.supportsGlTextures || [],
    instrumentation: manifest.instrumentation || null,
    application: {
      label: app.label || null,
      icon: app.icon || null,
      theme: app.theme || null,
      debuggable: Boolean(app.debuggable),
      allowBackup: Boolean(app.allowBackup),
      launcherActivities: (app.launcherActivities || []).map((item) => item.name).filter(Boolean),
      activities: (app.activities || []).map((item) => item.name).filter(Boolean),
      activityAliases: (app.activityAliases || []).map((item) => item.name).filter(Boolean),
      services: (app.services || []).map((item) => item.name).filter(Boolean),
      receivers: (app.receivers || []).map((item) => item.name).filter(Boolean),
      providers: (app.providers || []).map((item) => item.name).filter(Boolean),
      usesLibraries: (app.usesLibraries || []).map((item) => item.name).filter(Boolean),
      metaData: app.metaData || [],
    },
  };
}

function buildReportText(input: {
  apkName: string;
  apkSize: number;
  sha256: string;
  appLabel: string;
  packageName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  manifest: ReturnType<typeof manifestSummary>;
  structure: StructureSummary;
  resources: ResourceSummary;
}) {
  const { manifest, structure, resources } = input;
  return [
    "# Static APK Analysis Report",
    "",
    "> **Static inspection only.** The APK was not installed or executed. No runtime behavior, UI screens, network traffic, or device interaction was observed.",
    "",
    "## File",
    "",
    `- Name: \`${input.apkName}\``,
    `- Size: ${formatBytes(input.apkSize)} (${input.apkSize.toLocaleString()} bytes)`,
    `- SHA-256: \`${input.sha256}\``,
    "",
    "## Package",
    "",
    `- App label: **${input.appLabel}**`,
    `- Package name: \`${input.packageName}\``,
    `- Version: ${input.versionName} (code ${input.versionCode})`,
    `- Min SDK: ${input.minSdk}`,
    `- Target SDK: ${input.targetSdk}`,
    "",
    "## Manifest metadata",
    "",
    `- Launcher activities: ${manifest.application.launcherActivities.length}`,
    `- Activities: ${manifest.application.activities.length}`,
    `- Services: ${manifest.application.services.length}`,
    `- Receivers: ${manifest.application.receivers.length}`,
    `- Providers: ${manifest.application.providers.length}`,
    `- Permissions: ${manifest.permissions.length}`,
    `- Declared features: ${manifest.features.length}`,
    "",
    "### Permissions",
    "",
    manifest.permissions.length
      ? manifest.permissions.map((permission) => `- \`${permission}\``).join("\n")
      : "(none declared)",
    "",
    "### Launcher activities",
    "",
    manifest.application.launcherActivities.length
      ? manifest.application.launcherActivities.map((name) => `- \`${name}\``).join("\n")
      : "(no launcher activity found)",
    "",
    "## Structure",
    "",
    `- Archive entries: ${structure.entryCount.toLocaleString()}`,
    `- Files: ${structure.fileCount.toLocaleString()}`,
    `- Uncompressed size: ${formatBytes(structure.uncompressedBytes)}`,
    `- DEX files: ${structure.dexFiles.length}`,
    `- Native ABIs: ${Object.keys(structure.nativeLibraries).join(", ") || "(none)"}`,
    `- Assets: ${structure.assets.length}`,
    `- Signature files: ${structure.signatureFiles.length}`,
    "",
    "## Resources",
    "",
    `- Resource files: ${resources.resourceFileCount.toLocaleString()}`,
    `- Resource bytes: ${formatBytes(resources.resourceBytes)}`,
    `- Resource groups: ${Object.keys(resources.groups).length}`,
    `- Locales: ${resources.locales.join(", ") || "(none detected)"}`,
    `- resources.arsc present: ${resources.hasResourcesArsc ? "yes" : "no"}`,
    "",
    "### Largest resource groups",
    "",
    Object.entries(resources.groups)
      .sort(([, a], [, b]) => b.bytes - a.bytes)
      .slice(0, 15)
      .map(([group, value]) => `- \`${group}\`: ${value.count} files, ${formatBytes(value.bytes)}`)
      .join("\n") || "(none)",
    "",
    "## Limitations",
    "",
    "- This report uses static archive inspection and compiled-resource decoding only.",
    "- It does not prove runtime behavior, visible screens, copy, or feature parity.",
    "- Obfuscated, packed, split, or malformed APKs may expose only partial metadata.",
    "- No APK binary or extracted code is stored in the database.",
  ].join("\n");
}

export async function analyzeApk(apkId: string): Promise<void> {
  const upload = getApkUpload(apkId);
  if (!upload) return;
  const analysis = getApkAnalysis(apkId);
  if (!analysis) return;
  const started = Date.now();
  const log = (level: "info" | "warn" | "error" | "success", message: string) => {
    appendApkAnalysisLog(analysis.id, level, message);
  };
  const progress = (value: number, stage: string, patch: Record<string, unknown> = {}) => {
    updateApkAnalysis(analysis.id, { progress: value, stage, ...patch });
  };

  try {
    updateApkAnalysis(analysis.id, {
      status: "running",
      progress: 2,
      stage: "Reading APK archive",
      startedAt: analysis.startedAt || new Date().toISOString(),
      completedAt: null,
      error: null,
    });
    addActivity({
      projectId: upload.projectId,
      type: "apk.analysis.started",
      message: `Static APK analysis started for ${upload.originalName}`,
    });
    log("info", `Opening ${upload.originalName} (${formatBytes(upload.sizeBytes)})`);
    const filePath = getStoredApkPath(upload.storageKey);
    const entries = await listApkEntries(filePath);
    const manifestEntry = entries.find(
      (entry) => !entry.isDirectory && entry.name.toLowerCase() === "androidmanifest.xml",
    );
    if (!manifestEntry) throw new Error("AndroidManifest.xml is missing from the APK.");
    const structure = emptyStructure(entries);
    log(
      "info",
      `Inventoried ${structure.fileCount.toLocaleString()} files across ${structure.entryCount.toLocaleString()} archive entries`,
    );
    progress(15, "Decoding AndroidManifest.xml");

    const reader = await ApkReader.open(filePath);
    const manifest = await reader.readManifest();
    const manifestInfo = manifestSummary(manifest);
    log("info", `Parsed manifest for ${manifestInfo.package || "unknown package"}`);
    progress(40, "Resolving app resources");

    let appInfo: ParsedApkInfo | null = null;
    try {
      appInfo = await new AppInfoParser(filePath).parse();
      log("info", "Resolved application label and icon resources");
    } catch (error) {
      log(
        "warn",
        `Resource label/icon resolution was partial: ${
          error instanceof Error ? error.message : "unknown parser error"
        }`,
      );
    }

    progress(60, "Inspecting resources and native structure");
    const resources = summarizeResources(entries, appInfo);
    const packageName = manifestInfo.package || "unknown";
    const appLabel =
      (typeof appInfo?.application?.label?.[0] === "string" &&
        appInfo.application.label[0].trim()) ||
      (manifestInfo.application.label &&
      !String(manifestInfo.application.label).startsWith("resourceId:")
        ? String(manifestInfo.application.label)
        : packageName);
    const versionCode = String(manifestInfo.versionCode ?? "");
    const versionName = String(manifestInfo.versionName ?? "");
    const minSdk = String(manifestInfo.minSdkVersion ?? "");
    const targetSdk = String(manifestInfo.targetSdkVersion ?? "");
    log(
      "info",
      `Package ${packageName}; ${resources.resourceFileCount.toLocaleString()} resource files; ${structure.dexFiles.length} DEX file(s)`,
    );

    progress(85, "Writing static analysis report");
    const report = {
      scan: {
        type: "static",
        disclaimer:
          "Static APK inspection only. The APK was not installed or executed; no runtime behavior or visible screens were observed.",
        analyzer: "Replica Studio APK analyzer",
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      },
      file: {
        name: upload.originalName,
        sizeBytes: upload.sizeBytes,
        sha256: upload.sha256,
      },
      package: {
        packageName,
        appLabel,
        versionName,
        versionCode,
        minSdk,
        targetSdk,
      },
      manifest: manifestInfo,
      structure,
      resources,
    };
    const reportText = buildReportText({
      apkName: upload.originalName,
      apkSize: upload.sizeBytes,
      sha256: upload.sha256,
      appLabel,
      packageName,
      versionName,
      versionCode,
      minSdk,
      targetSdk,
      manifest: manifestInfo,
      structure,
      resources,
    });

    updateApkAnalysis(analysis.id, {
      status: "completed",
      progress: 100,
      stage: "Static analysis complete",
      packageName,
      appLabel,
      versionName: versionName || null,
      versionCode: versionCode || null,
      minSdk: minSdk || null,
      targetSdk: targetSdk || null,
      manifest: manifestInfo,
      structure,
      resources,
      report,
      reportText,
      error: null,
      completedAt: new Date().toISOString(),
    });
    log("success", `Static analysis complete in ${Date.now() - started} ms`);
    addActivity({
      projectId: upload.projectId,
      type: "apk.analysis.completed",
      message: `Static APK analysis completed for ${upload.originalName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown APK analysis error";
    updateApkAnalysis(analysis.id, {
      status: "failed",
      stage: "Analysis failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    log("error", message);
    addActivity({
      projectId: upload.projectId,
      type: "apk.analysis.failed",
      message: `Static APK analysis failed for ${upload.originalName}: ${message}`,
    });
  }
}
